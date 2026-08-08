import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { scoreIntent } from '../../src/lib/intent-scorer'
import { draftReply } from '../../src/lib/draft-reply'
import { evaluateAutoSend } from '../../src/lib/confidence-engine'
import { NormalizedPost } from '../../src/lib/types'
import * as dotenv from 'dotenv'
import path from 'path'
import { randomBytes } from 'crypto'
import { buildAttributionShortUrl } from '../../src/lib/attribution'
import { getAppUrl } from '../../src/lib/app-url'
import { ACTIONABLE_INTENT_THRESHOLD, type IntentLabel } from '../../src/lib/intent'
import { evaluateIntentPreflight } from '../../src/lib/intent-preflight'
import { getIntentDailyLimit, getPlanLimits, normalizePlan } from '../../src/lib/plan-limits'
import { getConfiguredSecret, hasRedditPostingProvider } from '../../src/lib/env'
import {
  emptyAiUsage,
  getAiUsageFromError,
  recordAiUsage,
  releaseAiSpend,
  reserveAiSpend,
  type AiUsage,
} from '../../src/lib/ai-usage'
import { dispatchPendingOutbox } from '../../src/lib/backend-maintenance'
import { checkGoogleRankQueue, notifySlackQueue } from '../../src/lib/queues'
import { recordAutomationDecision, recordEngagementEvent } from '../../src/lib/automation-audit'
import { getPlatformCapabilities } from '../../src/lib/platform-capabilities'
import { withScoreLock } from '../../src/lib/score-lock'
import {
  evaluateRedditReplyPolicy,
  extractSubredditFromRedditUrl,
  getSubredditCommunityPolicy,
  toCommunityPolicyAudit,
  type RedditReplyPolicyDecision,
} from '../../src/lib/reddit-community-policy'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

export type ScorePostPayload = {
  userId: string
  keywordId: string
  post: NormalizedPost
}

type ScorePostOptions = {
  allowAutoSend?: boolean
  enqueueFollowUpJobs?: boolean
  providerRetries?: number
}

export async function scorePostHandler(job: Job) {
  const payload = job.data as ScorePostPayload
  const result = await withScoreLock(
    payload.userId,
    payload.post.externalId,
    () => processScorePost(payload),
  )
  if (result === null) {
    logger.info(
      { jobId: job.id, userId: payload.userId, externalId: payload.post.externalId },
      'Skipped duplicate score job while another worker owns the score lease',
    )
  }
  return result
}

export async function processScorePost(
  payload: ScorePostPayload,
  options: ScorePostOptions = {},
) {
  const { userId, keywordId, post } = payload
  const allowAutoSend = options.allowAutoSend !== false
  const enqueueFollowUpJobs = options.enqueueFollowUpJobs !== false
  const providerRetries = options.providerRetries
  let signalReserved = false
  let draftReserved = false

  try {
    // 1. Resume a checkpointed high-intent thread after a worker/provider
    // failure. Completed rows only need their durable outbox dispatched.
    const { data: existing, error: existingError } = await supabase
      .from('monitored_threads')
      .select('id, keyword_id, intent_score, intent_label, flag, score_reasoning, matched_signals, status, tracking_sid')
      .eq('user_id', userId)
      .eq('platform', post.platform)
      .eq('external_id', post.externalId)
      .maybeSingle()

    if (existingError) throw existingError
    if (existing && existing.status !== 'pending') {
      if (enqueueFollowUpJobs) await dispatchPendingOutbox(1, existing.id)
      return
    }
    const hasScoringCheckpoint = Boolean(
      existing
      && existing.intent_score !== null
      && existing.intent_label,
    )

    // 2. Fetch user profile for context and plan
    const { data: extendedProfile } = await supabase
      .from('profiles')
      .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, competitors, tone_examples, plan, auto_send_enabled, auto_send_threshold, high_intent_threshold, auto_send_platforms, auto_send_communities, auto_send_daily_limit, referral_tracking_enabled')
      .eq('id', userId)
      .single()
    let profile = extendedProfile
    if (!profile) {
      const legacyResult = await supabase
        .from('profiles')
        .select('business_name, business_description, business_url, business_type, writing_style, competitors, tone_examples, plan, auto_send_enabled, auto_send_threshold, high_intent_threshold, referral_tracking_enabled')
        .eq('id', userId)
        .single()
      if (legacyResult.error) throw legacyResult.error
      profile = legacyResult.data
        ? {
            ...legacyResult.data,
            tone_archetype: null,
            style_guardrails: [],
            auto_send_platforms: ['bluesky'],
            auto_send_communities: [],
            auto_send_daily_limit: 3,
            high_intent_threshold: 80,
          }
        : null
    }

    if (!profile) throw new Error('Profile not found for scoring job')
    const { data: keyword, error: keywordError } = await supabase
      .from('keywords')
      .select('term')
      .eq('id', keywordId)
      .maybeSingle()
    if (keywordError) throw keywordError

    const plan = normalizePlan(profile.plan)
    const planLimits = getPlanLimits(plan)
    const hasAnthropic = Boolean(getConfiguredSecret(process.env.ANTHROPIC_API_KEY))

    let scoreResult: Awaited<ReturnType<typeof scoreIntent>>
    let evidenceSignals: string[]
    let paidIntentGatePassed = true
    let intentManualReviewReason = 'preflight_ai_bypassed'
    if (hasScoringCheckpoint && existing) {
      scoreResult = {
        score: Number(existing.intent_score ?? 0),
        label: existing.intent_label as IntentLabel,
        flag: existing.flag ?? undefined,
        reasoning: existing.score_reasoning ?? 'Restored from a persisted scoring checkpoint.',
        usage: emptyAiUsage(),
      }
      evidenceSignals = existing.matched_signals ?? []
    } else {
      // 3. Reject irrelevant/promotional posts before reserving a paid signal.
      // A raw keyword hit must never consume a customer's monthly allowance.
      const preflight = evaluateIntentPreflight(post, profile, {
        keywordTerm: keyword?.term,
      })
      evidenceSignals = preflight.evidenceSignals
      if (!preflight.isQualifiedCandidate) {
        await saveThread({
          userId,
          keywordId,
          post,
          intentScore: preflight.score,
          intentLabel: preflight.label,
          status: 'dismissed',
          flag: preflight.flag,
          reasoning: preflight.reasoning,
          evidenceSignals,
          automationReason: 'preflight_rejected',
        })
        logger.info({
          userId,
          platform: post.platform,
          externalId: post.externalId,
          evidenceSignals: evidenceSignals.slice(0, 6),
        }, 'Intent preflight rejected an unqualified candidate')
        return
      }

      const canProcessSignal = await reserveMonthlySignal(
        userId,
        planLimits.threadsPerMonth,
      )
      if (!canProcessSignal) {
        // Make this terminal. Leaving an unscored row pending causes it to sit
        // at the head of the global queue and starve every later candidate.
        const dismissedThread = await saveThread({
          userId,
          keywordId,
          post,
          intentScore: 0,
          intentLabel: 'other',
          status: 'dismissed',
          reasoning: 'Skipped because the monthly signal allowance is exhausted; this post was not analyzed.',
          evidenceSignals,
          automationReason: 'signal_limit_reached',
        })
        await clearUnscoredIntent(dismissedThread.id)
        logger.info({ userId, plan }, 'Monthly signal limit reached; candidate dismissed from the scoring queue')
        return
      }
      signalReserved = true

      paidIntentGatePassed = !hasAnthropic || preflight.shouldUseAi

      if (hasAnthropic && preflight.shouldUseAi) {
        // Reserve provider spend and the daily intent allowance atomically.
        const intentSpend = await reserveAiSpend(supabase, {
          userId,
          purpose: 'intent',
          plan,
        })
        if (!intentSpend) {
          logger.warn({ userId, plan }, 'AI spend cap blocked intent scoring')
          scoreResult = {
            score: preflight.score,
            label: preflight.label,
            flag: preflight.flag,
            reasoning: preflight.reasoning,
            usage: emptyAiUsage(),
          }
          paidIntentGatePassed = false
          intentManualReviewReason = 'intent_spend_limit_reached'
        } else {
          let canScore: boolean
          try {
            canScore = await checkBudget(userId, profile.plan, 'intent')
          } catch (error) {
            await safelyReleaseAiSpend(intentSpend.id, { userId, purpose: 'intent' })
            throw error
          }
          if (!canScore) {
            await safelyReleaseAiSpend(intentSpend.id, { userId, purpose: 'intent' })
            logger.info({ userId }, 'Daily intent-scoring limit reached; preserving deterministic result')
            scoreResult = {
              score: preflight.score,
              label: preflight.label,
              flag: preflight.flag,
              reasoning: preflight.reasoning,
              usage: emptyAiUsage(),
            }
            paidIntentGatePassed = false
            intentManualReviewReason = 'intent_plan_limit_reached'
          } else {
            // Score intent and reconcile the reservation with actual usage.
            try {
              scoreResult = await scoreIntent(post, profile, {
                maxRetries: providerRetries,
                keywordTerm: keyword?.term,
              })
              await safelyRecordAiUsage(intentSpend.id, scoreResult.usage, {
                userId,
                purpose: 'intent',
              })
            } catch (error) {
              await settleFailedAiSpend(intentSpend.id, error, {
                userId,
                purpose: 'intent',
              })
              logger.warn({ err: error, userId }, 'AI intent scoring failed; preserving deterministic result for manual review')
              scoreResult = {
                score: preflight.score,
                label: preflight.label,
                flag: preflight.flag,
                reasoning: preflight.reasoning,
                usage: emptyAiUsage(),
              }
              paidIntentGatePassed = false
              intentManualReviewReason = 'intent_provider_failed'
            }
          }
        }
      } else {
        scoreResult = {
          score: preflight.score,
          label: preflight.label,
          flag: preflight.flag,
          reasoning: preflight.reasoning,
          usage: emptyAiUsage(),
        }
        logger.info({
          userId,
          platform: post.platform,
          externalId: post.externalId,
          score: scoreResult.score,
          label: scoreResult.label,
          shouldUseAi: preflight.shouldUseAi,
          evidenceSignals: evidenceSignals.slice(0, 6),
        }, hasAnthropic ? 'Intent preflight skipped paid AI scoring' : 'Intent preflight used deterministic scoring')
      }
    }
    
    // Save thread early if score is low
    if (scoreResult.score < ACTIONABLE_INTENT_THRESHOLD) {
      await saveThread({
        userId,
        keywordId,
        post,
        intentScore: scoreResult.score,
        intentLabel: scoreResult.label,
        status: 'dismissed',
        flag: scoreResult.flag,
        reasoning: scoreResult.reasoning,
        evidenceSignals,
        automationReason: 'low_intent',
      })
      signalReserved = false
      return
    }

    if (!paidIntentGatePassed) {
      await saveThread({
        userId,
        keywordId,
        post,
        intentScore: scoreResult.score,
        intentLabel: scoreResult.label,
        status: 'needs_manual_reply',
        flag: scoreResult.flag,
        reasoning: scoreResult.reasoning,
        evidenceSignals,
        automationReason: intentManualReviewReason,
      })
      signalReserved = false
      return
    }

    // Persist the paid intent result before drafting. A retry resumes from this
    // checkpoint and never pays to classify the same user/post twice.
    if (!hasScoringCheckpoint) {
      await saveThread({
        userId,
        keywordId,
        post,
        intentScore: scoreResult.score,
        intentLabel: scoreResult.label,
        status: 'pending',
        flag: scoreResult.flag,
        reasoning: scoreResult.reasoning,
        evidenceSignals,
        automationReason: 'draft_pending',
      })
      signalReserved = false
    }

    if (!hasAnthropic) {
      await saveThread({
        userId,
        keywordId,
        post,
        intentScore: scoreResult.score,
        intentLabel: scoreResult.label,
        status: 'needs_manual_reply',
        flag: scoreResult.flag,
        reasoning: scoreResult.reasoning,
        evidenceSignals,
        automationReason: 'ai_provider_unavailable',
      })
      signalReserved = false
      return
    }

    // 5. Atomic budget check for reply drafting
    const draftSpend = await reserveAiSpend(supabase, {
      userId,
      purpose: 'draft',
      plan,
    })
    if (!draftSpend) {
      logger.warn({ userId, plan }, 'AI spend cap blocked reply drafting')
      await saveThread({
        userId,
        keywordId,
        post,
        intentScore: scoreResult.score,
        intentLabel: scoreResult.label,
        status: 'needs_manual_reply',
        flag: scoreResult.flag,
        reasoning: scoreResult.reasoning,
        evidenceSignals,
        automationReason: 'ai_spend_limit_reached',
      })
      signalReserved = false
      return
    }

    let canDraft: boolean
    try {
      canDraft = await checkBudget(userId, profile.plan, 'draft')
    } catch (error) {
      await safelyReleaseAiSpend(draftSpend.id, { userId, purpose: 'draft' })
      throw error
    }
    if (!canDraft) {
      await safelyReleaseAiSpend(draftSpend.id, { userId, purpose: 'draft' })
      logger.info(`[Budget] User ${userId} exceeded reply-draft limit.`)
      // Save as needs manual reply
      await saveThread({
        userId,
        keywordId,
        post,
        intentScore: scoreResult.score,
        intentLabel: scoreResult.label,
        status: 'needs_manual_reply',
        flag: scoreResult.flag,
        reasoning: scoreResult.reasoning,
        evidenceSignals,
        automationReason: 'draft_plan_limit_reached',
      })
      signalReserved = false
      return
    }
    draftReserved = true

    // 6. Draft Reply — generate tracking SID before drafting so Claude can embed it naturally
    const trackingEnabled = profile.referral_tracking_enabled !== false // default true
    const trackingSid = trackingEnabled ? randomBytes(5).toString('base64url') : undefined // ~7-char URL-safe token
    const trackingUrl = trackingEnabled && profile.business_url && trackingSid
      ? buildAttributionShortUrl(getAppUrl(), trackingSid)
      : undefined

    let draftResult: Awaited<ReturnType<typeof draftReply>>
    try {
      draftResult = await draftReply(
        post,
        profile,
        scoreResult.score,
        trackingUrl,
        { maxRetries: providerRetries },
      )
      await safelyRecordAiUsage(draftSpend.id, draftResult.usage, {
        userId,
        purpose: 'draft',
      })
    } catch (error) {
      await settleFailedAiSpend(draftSpend.id, error, {
        userId,
        purpose: 'draft',
      })
      await safelyReleaseMonthlyDraft(userId)
      draftReserved = false
      logger.warn({ err: error, userId }, 'AI drafting failed; routing scored conversation to manual reply')
      await saveThread({
        userId,
        keywordId,
        post,
        intentScore: scoreResult.score,
        intentLabel: scoreResult.label,
        status: 'needs_manual_reply',
        flag: scoreResult.flag,
        reasoning: scoreResult.reasoning,
        evidenceSignals,
        automationReason: 'draft_provider_failed',
      })
      signalReserved = false
      return
    }
    const draftText = draftResult.text

    // 7. Auto-send decision — routed through the single unified gatekeeper.
    //    All safeguards (disclosure, tone, cold-start, confidence threshold)
    //    are enforced inside evaluateAutoSend(). DO NOT inline duplicate logic here.
    const trustEvaluation = await evaluateAutoSend(
      userId,
      post.platform,
      draftResult,
      {
        auto_send_enabled: profile.auto_send_enabled,
        auto_send_threshold: profile.auto_send_threshold,
        high_intent_threshold: profile.high_intent_threshold,
        plan: profile.plan ?? 'free',
      },
      post.sourceTarget ?? null,
      scoreResult.score,
    )
    const capabilities = getPlatformCapabilities(post.platform, {
      redditDirectPosting: hasRedditPostingProvider(),
    })
    const platformConnected = post.platform === 'reddit'
      ? Boolean((await supabase
          .from('reddit_connection_secrets')
          .select('connection_id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle()).data)
      : post.platform === 'bluesky'
        ? Boolean((await supabase
            .from('platform_connections')
            .select('id')
            .eq('user_id', userId)
            .eq('platform', post.platform)
            .maybeSingle()).data)
        : false
    const enabledPlatforms = Array.isArray(profile.auto_send_platforms)
      ? profile.auto_send_platforms
      : ['bluesky']
    const allowedCommunities = Array.isArray(profile.auto_send_communities)
      ? profile.auto_send_communities.map(value => value.trim().toLocaleLowerCase()).filter(Boolean)
      : []
    const normalizedTarget = (post.sourceTarget ?? '').trim().toLocaleLowerCase()
    let evaluation = trustEvaluation
    let redditCommunityPolicyDecision: RedditReplyPolicyDecision | null = null

    if (evaluation.approved && !enabledPlatforms.includes(post.platform)) {
      evaluation = blockAutomation(evaluation, 'auto_send_platform_disabled')
    } else if (evaluation.approved && capabilities.delivery === 'direct' && !platformConnected) {
      evaluation = blockAutomation(evaluation, 'platform_connection_required')
    } else if (
      evaluation.approved
      && allowedCommunities.length > 0
      && !allowedCommunities.includes(normalizedTarget)
    ) {
      evaluation = blockAutomation(evaluation, 'auto_send_target_out_of_scope')
    } else if (evaluation.approved && (!allowAutoSend || capabilities.delivery !== 'direct')) {
      evaluation = blockAutomation(evaluation, 'assisted_delivery_required')
    }

    if (evaluation.approved && post.platform === 'reddit') {
      const communityPolicy = await getSubredditCommunityPolicy(
        userId,
        extractSubredditFromRedditUrl(post.url) || post.sourceTarget || '',
      )
      redditCommunityPolicyDecision = evaluateRedditReplyPolicy(communityPolicy, {
        text: draftText,
        businessName: profile.business_name,
        businessUrl: profile.business_url,
      })
      if (redditCommunityPolicyDecision.outcome !== 'auto_send_allowed') {
        evaluation = blockAutomation(evaluation, redditCommunityPolicyDecision.reason)
      }
    }

    if (
      evaluation.approved
      && capabilities.delivery === 'direct'
      && ['reddit', 'bluesky'].includes(post.platform)
    ) {
      // All gates cleared — save and enqueue for auto-send
      const autoSendPayload = {
        userId,
        threadExternalId: post.externalId,
        text: draftText,
        platform: post.platform as 'reddit' | 'bluesky',
        triggerType: 'auto' as const,
        sourceTarget: post.sourceTarget || undefined,
      }
      const thread = await saveThread({
        userId,
        keywordId,
        post,
        intentScore: scoreResult.score,
        intentLabel: scoreResult.label,
        status: 'drafted',
        draftText,
        flag: scoreResult.flag,
        reasoning: scoreResult.reasoning,
        trackingSid,
        evidenceSignals,
        qualityIssues: draftResult.qualityIssues.map(issue => issue.code),
        automationReason: evaluation.reason,
        autoSendPayload,
      })
      signalReserved = false
      draftReserved = false
      if (thread) {
        await recordInitialAutomationAudit({
          userId,
          threadId: thread.id,
          post,
          scoreResult,
          draftResult,
          evaluation,
          deliveryMode: capabilities.delivery,
          hasAnthropic,
          redditCommunityPolicyDecision,
        })
      }
      if (thread && enqueueFollowUpJobs) {
        await dispatchPendingOutbox(1, thread.id)
        // Fire-and-forget: check if thread URL ranks on Google for this keyword (Feature 5)
        if (post.url) {
          checkGoogleRankQueue.add(`rank-${thread.id}`, { threadId: thread.id, url: post.url, matchedKeyword: post.sourceTarget }).catch(() => {})
        }
        // Fire-and-forget Slack notification
        notifySlackQueue.add(`slack-${thread.id}`, {
          userId,
          postUrl: post.url,
          postTitle: post.title || post.text?.slice(0, 100),
          postAuthor: post.author,
          intentScore: scoreResult.score,
          draftText,
          subreddit: post.sourceTarget || 'reddit',
        }).catch(() => {}) // never block on Slack
        logger.info({ userId, threadId: thread.id, reason: evaluation.reason, confidence: evaluation.automationConfidence, threshold: evaluation.dynamicThreshold }, 'Enqueued auto-send')
      }
    } else {
      // Any gate failed — route to manual review queue
      const thread = await saveThread({
        userId,
        keywordId,
        post,
        intentScore: scoreResult.score,
        intentLabel: scoreResult.label,
        status: 'drafted',
        draftText,
        flag: scoreResult.flag,
        reasoning: scoreResult.reasoning,
        trackingSid,
        evidenceSignals,
        qualityIssues: draftResult.qualityIssues.map(issue => issue.code),
        automationReason: evaluation.reason,
      })
      signalReserved = false
      draftReserved = false
      if (thread) {
        await recordInitialAutomationAudit({
          userId,
          threadId: thread.id,
          post,
          scoreResult,
          draftResult,
          evaluation,
          deliveryMode: capabilities.delivery,
          hasAnthropic,
          redditCommunityPolicyDecision,
        })
      }
      if (thread && enqueueFollowUpJobs) {
        // Fire-and-forget: check if thread URL ranks on Google (Feature 5)
        if (post.url) {
          checkGoogleRankQueue.add(`rank-${thread.id}`, { threadId: thread.id, url: post.url }).catch(() => {})
        }
        // Fire-and-forget Slack notification
        notifySlackQueue.add(`slack-${thread.id}`, {
          userId,
          postUrl: post.url,
          postTitle: post.title || post.text?.slice(0, 100),
          postAuthor: post.author,
          intentScore: scoreResult.score,
          draftText,
          subreddit: post.sourceTarget || 'reddit',
        }).catch(() => {}) // never block on Slack
      }
      logger.info({ userId, reason: evaluation.reason, confidence: evaluation.automationConfidence, threshold: evaluation.dynamicThreshold }, 'Routed to manual review')
    }

  } catch (error) {
    if (signalReserved) {
      await safelyReleaseMonthlySignal(userId)
    }
    if (draftReserved) {
      await safelyReleaseMonthlyDraft(userId)
    }
    logger.error({ err: error }, `Failed to score post ${post.externalId} for user ${userId}:`)
    throw error
  }
}

function blockAutomation(
  evaluation: Awaited<ReturnType<typeof evaluateAutoSend>>,
  reason: string,
): Awaited<ReturnType<typeof evaluateAutoSend>> {
  return { ...evaluation, approved: false, reason }
}

async function recordInitialAutomationAudit(input: {
  userId: string
  threadId: string
  post: NormalizedPost
  scoreResult: Awaited<ReturnType<typeof scoreIntent>>
  draftResult: Awaited<ReturnType<typeof draftReply>>
  evaluation: Awaited<ReturnType<typeof evaluateAutoSend>>
  deliveryMode: 'direct' | 'assisted' | 'manual' | 'unsupported'
  hasAnthropic: boolean
  redditCommunityPolicyDecision?: RedditReplyPolicyDecision | null
}) {
  const {
    userId,
    threadId,
    post,
    scoreResult,
    draftResult,
    evaluation,
    deliveryMode,
    hasAnthropic,
    redditCommunityPolicyDecision,
  } = input
  const source = 'scheduled_monitor'

  await Promise.all([
    recordEngagementEvent(supabase, {
      userId,
      threadId,
      eventType: 'signal_discovered',
      platform: post.platform,
      source,
      metadata: {
        externalId: post.externalId,
        sourceTarget: post.sourceTarget,
        sourceCreatedAt: post.createdAt,
      },
      idempotencyKey: `${threadId}:signal-discovered`,
      occurredAt: post.createdAt,
    }),
    recordEngagementEvent(supabase, {
      userId,
      threadId,
      eventType: 'intent_scored',
      platform: post.platform,
      metadata: {
        score: scoreResult.score,
        label: scoreResult.label,
        reasoning: scoreResult.reasoning,
        provider: hasAnthropic ? 'anthropic' : 'deterministic',
      },
      idempotencyKey: `${threadId}:intent-scored`,
    }),
    recordEngagementEvent(supabase, {
      userId,
      threadId,
      eventType: 'draft_generated',
      platform: post.platform,
      metadata: {
        provider: 'anthropic',
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        qualityIssues: draftResult.qualityIssues.map(issue => issue.code),
        mentionedProduct: draftResult.mentionedProduct,
        hasDisclosure: draftResult.hasDisclosure,
      },
      idempotencyKey: `${threadId}:initial-draft-generated`,
    }),
    recordEngagementEvent(supabase, {
      userId,
      threadId,
      eventType: 'automation_evaluated',
      platform: post.platform,
      metadata: {
        approved: evaluation.approved,
        reason: evaluation.reason,
        confidence: evaluation.automationConfidence,
        threshold: evaluation.dynamicThreshold,
        deliveryMode,
        communityPolicy: toCommunityPolicyAudit(redditCommunityPolicyDecision),
      },
      idempotencyKey: `${threadId}:initial-automation-evaluated`,
    }),
    recordAutomationDecision(supabase, {
      userId,
      threadId,
      platform: post.platform,
      deliveryMode,
      evaluation,
      idempotencyKey: `${threadId}:initial-automation-decision`,
      contentPolicy: {
        flagged: draftResult.flagged,
        qualityIssues: draftResult.qualityIssues.map(issue => issue.code),
        mentionedProduct: draftResult.mentionedProduct,
        hasDisclosure: draftResult.hasDisclosure,
        hasCommercialLink: draftResult.hasCommercialLink,
        ...(toCommunityPolicyAudit(redditCommunityPolicyDecision)
          ? { communityPolicy: toCommunityPolicyAudit(redditCommunityPolicyDecision) }
          : {}),
      },
      modelContext: {
        intentProvider: hasAnthropic ? 'anthropic' : 'deterministic',
        intentModel: process.env.ANTHROPIC_INTENT_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        draftProvider: 'anthropic',
        draftModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        policyVersion: 'earned-automation-v1',
      },
    }),
  ])
}

async function reserveMonthlySignal(userId: string, limit: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('reserve_monthly_signal', {
    p_user_id: userId,
    p_limit: limit,
  })
  if (error) {
    throw new Error(`Signal budget reservation failed: ${error.message}`)
  }
  return data === true
}

async function safelyReleaseMonthlySignal(userId: string): Promise<void> {
  const { error } = await supabase.rpc('release_monthly_signal', {
    p_user_id: userId,
  })
  if (error) {
    logger.error({ error, userId }, 'Failed to release monthly signal reservation')
  }
}

async function safelyReleaseMonthlyDraft(userId: string): Promise<void> {
  const { error } = await supabase.rpc('release_monthly_draft', {
    p_user_id: userId,
  })
  if (error) {
    logger.error({ error, userId }, 'Failed to release monthly draft reservation')
  }
}

async function safelyRecordAiUsage(
  reservationId: string,
  usage: AiUsage,
  context: { userId: string; purpose: 'intent' | 'draft' },
): Promise<void> {
  try {
    await recordAiUsage(supabase, { reservationId, usage })
  } catch (error) {
    logger.error(
      { error, reservationId, ...context },
      'Failed to reconcile AI usage reservation',
    )
  }
}

async function safelyReleaseAiSpend(
  reservationId: string,
  context: { userId: string; purpose: 'intent' | 'draft' },
): Promise<void> {
  try {
    await releaseAiSpend(supabase, reservationId)
  } catch (error) {
    logger.error(
      { error, reservationId, ...context },
      'Failed to release AI spend reservation',
    )
  }
}

async function settleFailedAiSpend(
  reservationId: string,
  error: unknown,
  context: { userId: string; purpose: 'intent' | 'draft' },
): Promise<void> {
  const usage = getAiUsageFromError(error)
  if (
    usage.inputTokens > 0
    || usage.outputTokens > 0
    || usage.estimatedCostMicrousd > 0
  ) {
    await safelyRecordAiUsage(reservationId, usage, context)
    return
  }
  await safelyReleaseAiSpend(reservationId, context)
}

async function checkBudget(userId: string, plan: string, service: 'intent' | 'draft') {
  if (service === 'draft') {
    const { data, error } = await supabase.rpc('reserve_monthly_draft', {
      p_user_id: userId,
      p_limit: getPlanLimits(normalizePlan(plan)).aiDraftsPerMonth,
    })
    if (error) {
      throw new Error(`Draft budget reservation failed: ${error.message}`)
    }
    return data
  }

  const limit = getIntentDailyLimit(plan)

  const { data, error } = await supabase.rpc('increment_usage_if_under_limit', {
    p_user_id: userId,
    p_service: 'intent',
    p_limit: limit,
  })

  if (error) {
    throw new Error(`Budget reservation failed: ${error.message}`)
  }

  return data
}

async function saveThread(input: {
  userId: string
  keywordId: string
  post: NormalizedPost
  intentScore: number
  intentLabel: IntentLabel
  status: string
  draftText?: string
  flag?: string
  reasoning?: string
  trackingSid?: string
  evidenceSignals: string[]
  qualityIssues?: string[]
  automationReason?: string
  autoSendPayload?: {
    userId: string
    threadExternalId: string
    text: string
    platform: 'reddit' | 'bluesky'
    triggerType: 'auto'
    sourceTarget?: string
  }
}) {
  const {
    userId,
    keywordId,
    post,
    intentScore,
    intentLabel,
    status,
    draftText,
    flag,
    reasoning,
    trackingSid,
    evidenceSignals,
    qualityIssues,
    automationReason,
    autoSendPayload,
  } = input
  const { data: threadId, error } = await supabase.rpc('persist_scored_thread_v2', {
    p_user_id: userId,
    p_keyword_id: keywordId,
    p_platform: post.platform,
    p_external_id: post.externalId,
    p_author: post.author,
    p_title: post.title || null,
    p_text_content: post.text,
    p_url: post.url,
    p_source_created_at: post.createdAt,
    p_intent_score: intentScore,
    p_intent_label: intentLabel,
    p_status: status,
    p_flag: flag || null,
    p_reasoning: reasoning || null,
    p_tracking_sid: trackingSid || null,
    p_matched_signals: evidenceSignals,
    p_quality_issues: qualityIssues ?? [],
    p_automation_reason: automationReason || null,
    p_draft_text: draftText || null,
    p_auto_send_payload: autoSendPayload ?? null,
  })

  if (error) {
    throw new Error(`Failed to persist monitored thread: ${error.message}`)
  }
  if (!threadId) throw new Error('Failed to persist monitored thread: missing id')

  return { id: threadId }
}

/** Keep unanalysed plan-limited captures out of every customer-facing queue. */
async function clearUnscoredIntent(threadId: string): Promise<void> {
  const { error } = await supabase
    .from('monitored_threads')
    .update({ intent_score: null, intent_label: null })
    .eq('id', threadId)
    .eq('status', 'dismissed')
  if (error) {
    throw new Error(`Failed to clear unscored intent state: ${error.message}`)
  }
}
