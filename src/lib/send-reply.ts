import { createClient } from '@supabase/supabase-js'
import { logger } from './logger'
import {
  isRedditDirectPostingConfigured,
  postRedditReply,
  PlatformPostError,
} from './reddit-post'
import { postBlueskyReply } from './bluesky-post'
import {
  recordSuccessfulSend,
  releaseSendSlot,
  reserveSendSlot,
} from './send-limiter'
import { ensureAttributionMapping } from './attribution-store'
import { recordEngagementEvent } from './automation-audit'
import { sendRedditDeliveryAlert } from './reddit-delivery-alerts'
import { resolveReplyNotSentIncident } from './reddit-service-safety'
import { queuedAutoSendBlockReason } from './auto-send-policy'
import { hasActiveRedditConnection } from './reddit-session'
import {
  evaluateRedditReplyPolicy,
  extractSubredditFromRedditUrl,
  getSubredditCommunityPolicy,
  toCommunityPolicyAudit,
  type RedditReplyPolicyDecision,
} from './reddit-community-policy'
import { AUTO_REPLY_MAX_AGE_MS, evaluateContentFreshness } from './content-freshness'
import { areRepliesNearDuplicate } from './reply-similarity'

export type SendReplyData = {
  userId: string
  threadExternalId: string
  threadId: string
  text: string
  platform: 'reddit' | 'bluesky'
  triggerType: 'manual' | 'auto'
  sourceTarget?: string
}

export type SendReplyContext = {
  attempt: number
  maxAttempts: number
  jobId?: string
  discard?: () => void
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export function isRetryableSendError(error: unknown): boolean {
  return !(error instanceof PlatformPostError) || error.retryable
}

async function cancelQueuedAutoSend(
  supabase: ReturnType<typeof getSupabase>,
  threadId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('job_outbox')
    .update({
      status: 'cancelled',
      dispatched_at: new Date().toISOString(),
      last_error: `Automatic delivery cancelled: ${reason}`,
    })
    .eq('thread_id', threadId)
    .eq('kind', 'auto_send')
    .in('status', ['pending', 'dispatched'])
  if (error) {
    logger.warn({ error, threadId, reason }, 'Could not record automatic delivery cancellation')
  }
}

export async function processSendReply(
  data: SendReplyData,
  context: SendReplyContext,
) {
  const { userId, threadExternalId, threadId, text, platform, triggerType } = data
  const supabase = getSupabase()

  let maxPerDay: number | undefined
  let autoSendThreshold = 85
  let businessProfile: { business_name: string; business_url: string | null } | null = null
  let redditPolicyDecision: RedditReplyPolicyDecision | null = null
  let redditPostUrl: string | null = null
  let sendCommunity: string | undefined
  if (triggerType === 'auto') {
    const { data: automationProfile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, auto_send_enabled, auto_send_threshold, auto_send_daily_limit, auto_send_platforms, auto_send_communities, business_name, business_url')
      .eq('id', userId)
      .single()
    if (profileError || !automationProfile) {
      throw new Error(`Unable to load automation policy: ${profileError?.message ?? 'profile not found'}`)
    }

    const policyBlock = queuedAutoSendBlockReason(
      automationProfile,
      platform,
      data.sourceTarget,
      { redditDirectPostingEnabled: isRedditDirectPostingConfigured() },
    )
    if (policyBlock) {
      await cancelQueuedAutoSend(supabase, threadId, policyBlock)
      logger.info({ jobId: context.jobId, threadId, policyBlock }, 'Skipped auto-send after current policy check')
      return { skipped: true, reason: policyBlock }
    }

    let connectionActive = false
    if (platform === 'reddit') {
      connectionActive = await hasActiveRedditConnection(userId)
    } else {
      const { data: connection, error: connectionError } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('user_id', userId)
        .eq('platform', platform)
        .maybeSingle()
      if (connectionError) {
        throw new Error(`Unable to load automation connection: ${connectionError.message}`)
      }
      connectionActive = Boolean(connection)
    }
    if (!connectionActive) {
      const reason = 'platform_connection_removed'
      await cancelQueuedAutoSend(supabase, threadId, reason)
      logger.info({ jobId: context.jobId, threadId, reason }, 'Skipped auto-send after connection check')
      return { skipped: true, reason }
    }

    maxPerDay = Number(automationProfile.auto_send_daily_limit) || 3
    autoSendThreshold = Number(automationProfile.auto_send_threshold) || 85
    businessProfile = {
      business_name: automationProfile.business_name,
      business_url: automationProfile.business_url,
    }
  }

  if (platform === 'reddit') {
    if (!businessProfile) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('business_name, business_url')
        .eq('id', userId)
        .single()
      if (profileError || !profile?.business_name) {
        throw new Error(`Unable to load Reddit policy profile: ${profileError?.message ?? 'profile not found'}`)
      }
      businessProfile = profile
    }

    const { data: policyThread, error: policyThreadError } = await supabase
      .from('monitored_threads')
      .select('url, intent_score, source_created_at, created_at')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single()
    if (policyThreadError || !policyThread) {
      throw new Error(`Unable to load Reddit thread for policy check: ${policyThreadError?.message ?? 'thread not found'}`)
    }
    redditPostUrl = policyThread.url

    const subreddit = extractSubredditFromRedditUrl(policyThread.url) || data.sourceTarget
    sendCommunity = subreddit || undefined

    if (triggerType === 'auto') {
      if (!Number.isFinite(Number(policyThread.intent_score)) || Number(policyThread.intent_score) < autoSendThreshold) {
        const reason = 'intent_score_below_current_auto_send_threshold'
        await cancelQueuedAutoSend(supabase, threadId, reason)
        return { skipped: true, reason }
      }

      const freshness = evaluateContentFreshness(
        policyThread.source_created_at || policyThread.created_at,
        { maxAgeMs: AUTO_REPLY_MAX_AGE_MS },
      )
      if (freshness.fresh === false) {
        const reason = freshness.reason === 'source_too_old'
          ? 'source_post_outside_auto_reply_window'
          : 'source_post_time_unverified'
        await cancelQueuedAutoSend(supabase, threadId, reason)
        return { skipped: true, reason }
      }

      const { data: recentReplies, error: recentRepliesError } = await supabase
        .from('reply_analytics')
        .select('draft_text, edited_text')
        .eq('user_id', userId)
        .eq('was_sent', true)
        .order('sent_at', { ascending: false })
        .limit(25)
      if (recentRepliesError) {
        throw new Error(`Unable to run duplicate reply safety check: ${recentRepliesError.message}`)
      }
      if ((recentReplies ?? []).some(reply =>
        areRepliesNearDuplicate(text, reply.edited_text || reply.draft_text || ''),
      )) {
        const reason = 'near_duplicate_reply_requires_review'
        await cancelQueuedAutoSend(supabase, threadId, reason)
        return { skipped: true, reason }
      }
    }

    const communityPolicy = await getSubredditCommunityPolicy(userId, subreddit ?? '', {
      // This is the final gate immediately before provider delivery. It must
      // not rely on a stale decision made while the draft was created.
      forceRefresh: true,
    })
    redditPolicyDecision = evaluateRedditReplyPolicy(communityPolicy, {
      text,
      businessName: businessProfile.business_name,
      businessUrl: businessProfile.business_url,
    })

    if (redditPolicyDecision.outcome !== 'auto_send_allowed') {
      await recordEngagementEvent(supabase, {
        userId,
        threadId,
        eventType: 'automation_evaluated',
        platform,
        source: 'reddit_community_policy',
        metadata: toCommunityPolicyAudit(redditPolicyDecision),
        idempotencyKey: `${threadId}:reddit-policy:${redditPolicyDecision.policy.checkedAt}`,
      }).catch((auditError) => {
        logger.warn({ auditError, threadId }, 'Could not record Reddit community policy decision')
      })

      if (
        triggerType === 'auto'
        && redditPolicyDecision.outcome === 'manual_review_required'
      ) {
        await cancelQueuedAutoSend(supabase, threadId, redditPolicyDecision.reason)
        logger.info(
          { jobId: context.jobId, threadId, reason: redditPolicyDecision.reason },
          'Skipped auto-send after Reddit community policy check',
        )
        return { skipped: true, reason: redditPolicyDecision.reason }
      }

      if (redditPolicyDecision.outcome === 'blocked') {
        throw new PlatformPostError('reddit', redditPolicyDecision.message, false)
      }

      logger.info(
        { jobId: context.jobId, threadId, reason: redditPolicyDecision.reason },
        'Proceeding with explicitly approved manual Reddit reply after policy review',
      )
    }
  }

  const reservation = await reserveSendSlot(userId, platform, {
    maxPerDay,
    ...(triggerType === 'auto' && platform === 'reddit'
      ? {
          minimumGapSeconds: 30 * 60,
          community: sendCommunity,
          communityGapSeconds: 12 * 60 * 60,
        }
      : {}),
  })
  if ('reason' in reservation) {
    throw new PlatformPostError(
      platform,
      `Rate limited until ${new Date(reservation.reset).toISOString()}: ${reservation.reason}`,
      true,
    )
  }

  const { data: claimToken, error: claimError } = await supabase.rpc('claim_thread_for_send_v2', {
    p_thread_id: threadId,
    p_user_id: userId,
  })
  if (claimError) {
    await releaseSendSlot(userId, platform, reservation.token).catch(() => undefined)
    throw new Error(`Unable to claim reply: ${claimError.message}`)
  }
  if (!claimToken) {
    await releaseSendSlot(userId, platform, reservation.token).catch(() => undefined)
    logger.info({ jobId: context.jobId, threadId }, 'Reply already sent or no longer sendable')
    return { duplicate: true }
  }

  let externalSendSucceeded = false
  let externalPermalink: string | null = null

  try {
    const { data: threadRow, error: threadError } = await supabase
      .from('monitored_threads')
      .select('tracking_sid')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single()
    if (threadError) throw new Error(`Unable to load tracking state: ${threadError.message}`)

    if (threadRow.tracking_sid) {
      const profile = businessProfile ?? await (async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('business_name, business_url')
          .eq('id', userId)
          .single()
        if (error || !data) throw new Error(`Unable to load attribution destination: ${error?.message ?? 'profile not found'}`)
        return data
      })()
      if (!profile.business_url) throw new Error('Attribution is enabled but no business URL is configured')

      await ensureAttributionMapping(supabase, {
        userId,
        threadId,
        token: threadRow.tracking_sid,
        businessUrl: profile.business_url,
      })
    }

    const result = platform === 'reddit'
      ? await postRedditReply({
          userId,
          threadExternalId,
          postUrl: redditPostUrl ?? '',
          text,
          triggerType,
        })
      : await postBlueskyReply(userId, threadExternalId, text)
    externalSendSucceeded = true
    externalPermalink = result.permalink

    await recordSuccessfulSend(userId, platform, reservation.token, { community: sendCommunity })

    const { data: finalized, error: finalizeError } = await supabase.rpc(
      'finalize_successful_send',
      {
        p_thread_id: threadId,
        p_user_id: userId,
        p_claim_token: claimToken,
        p_platform: platform,
        p_trigger_type: triggerType,
        p_permalink: result.permalink,
      },
    )
    if (finalizeError || finalized !== true) {
      throw new Error(
        `Unable to finalize successful send: ${finalizeError?.message ?? 'claim no longer active'}`,
      )
    }

    await recordEngagementEvent(supabase, {
      userId,
      threadId,
      eventType: 'reply_sent',
      platform,
      actorType: 'provider',
      source: triggerType === 'auto' ? 'earned_automation' : 'manual_approval',
      metadata: {
        triggerType,
        permalink: result.permalink,
        ...(toCommunityPolicyAudit(redditPolicyDecision) ? { communityPolicy: toCommunityPolicyAudit(redditPolicyDecision) } : {}),
      },
      idempotencyKey: `${threadId}:reply-sent`,
    }).catch((auditError) => {
      logger.warn({ auditError, threadId }, 'Reply sent but engagement audit was not recorded')
    })
    await resolveReplyNotSentIncident(userId).catch((incidentError) => {
      logger.warn({ incidentError, threadId }, 'Could not resolve prior reply failure notice')
    })

    return { success: true, permalink: result.permalink }
  } catch (error) {
    const deliveryUncertain = error instanceof PlatformPostError && error.deliveryUncertain
    if (externalSendSucceeded || deliveryUncertain) {
      // A timed-out write may still have reached Reddit. Consume the rate-limit
      // slot pessimistically so an uncertain outcome cannot be followed by a
      // burst while reconciliation determines what actually happened.
      await recordSuccessfulSend(
        userId,
        platform,
        reservation.token,
        { community: sendCommunity },
      ).catch(() => undefined)
      await supabase.rpc('mark_send_reconciliation', {
        p_thread_id: threadId,
        p_user_id: userId,
        p_claim_token: claimToken,
        p_platform: platform,
        p_trigger_type: triggerType,
        p_permalink: externalPermalink,
        p_error_message: error instanceof Error
          ? error.message
          : 'Post-send persistence error',
      })
      if (deliveryUncertain) context.discard?.()
      throw error
    }

    await releaseSendSlot(userId, platform, reservation.token).catch(() => undefined)
    const retryable = isRetryableSendError(error)
    const finalAttempt = !retryable || context.attempt >= context.maxAttempts

    const { data: released, error: releaseError } = await supabase.rpc(
      'release_send_claim',
      {
        p_thread_id: threadId,
        p_user_id: userId,
        p_claim_token: claimToken,
      },
    )
    if (releaseError || released !== true) {
      throw new Error(
        `Unable to release failed send claim: ${releaseError?.message ?? 'claim no longer active'}`,
      )
    }

    if (finalAttempt) {
      if (!retryable) context.discard?.()
      await supabase.from('send_audit_log').insert({
        user_id: userId,
        thread_id: threadId,
        platform,
        trigger_type: triggerType,
        status: retryable ? 'failed_retryable' : 'failed_permanent',
        error_message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown send error',
      })
      await recordEngagementEvent(supabase, {
        userId,
        threadId,
        eventType: 'reply_failed',
        platform,
        actorType: 'provider',
        source: triggerType === 'auto' ? 'earned_automation' : 'manual_approval',
        metadata: {
          triggerType,
          retryable,
          error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown send error',
        },
        idempotencyKey: `${threadId}:reply-failed:${context.attempt}`,
      }).catch((auditError) => {
        logger.warn({ auditError, threadId }, 'Reply failure audit was not recorded')
      })
      // A final failure changes the user's work and needs a concise, durable
      // alert. Uncertain and reconnect states already have their own specific
      // incidents, so do not stack a second generic warning on top of them.
      const hasSpecificCustomerAlert = error instanceof PlatformPostError
        && (error.deliveryUncertain || error.reconnectRequired)
      if (!hasSpecificCustomerAlert) {
        await sendRedditDeliveryAlert({
          kind: 'repeated_failures',
          code: 'reply_not_sent',
          userId,
          actionPath: `/dashboard?thread=${encodeURIComponent(threadId)}`,
        }).catch((alertError) => {
          logger.warn({ alertError, threadId }, 'Reply failure customer alert was not recorded')
        })
      }
    }

    throw error
  }
}
