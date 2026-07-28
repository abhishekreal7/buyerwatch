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
import { matchedSignals } from '../../src/lib/buying-signal-filter'
import { getAppUrl } from '../../src/lib/app-url'
import { IntentLabel } from '../../src/lib/intent'
import { getPlanLimits, normalizePlan } from '../../src/lib/plan-limits'
import {
  emptyAiUsage,
  getAiUsageFromError,
  recordAiUsage,
  releaseAiSpend,
  reserveAiSpend,
  type AiUsage,
} from '../../src/lib/ai-usage'
import { dispatchPendingOutbox } from '../../src/lib/backend-maintenance'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

const INTENT_THRESHOLD = 60

export async function scorePostHandler(job: Job) {
  const { userId, keywordId, post } = job.data as { userId: string; keywordId: string; post: NormalizedPost }
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
      await dispatchPendingOutbox(1, existing.id)
      return
    }

    // 2. Fetch user profile for context and plan
    const { data: extendedProfile } = await supabase
      .from('profiles')
      .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, competitors, tone_examples, plan, auto_send_enabled, auto_send_threshold, referral_tracking_enabled')
      .eq('id', userId)
      .single()
    let profile = extendedProfile
    if (!profile) {
      const legacyResult = await supabase
        .from('profiles')
        .select('business_name, business_description, business_url, business_type, writing_style, competitors, tone_examples, plan, auto_send_enabled, auto_send_threshold, referral_tracking_enabled')
        .eq('id', userId)
        .single()
      if (legacyResult.error) throw legacyResult.error
      profile = legacyResult.data
        ? { ...legacyResult.data, tone_archetype: null, style_guardrails: [] }
        : null
    }

    if (!profile) throw new Error('Profile not found for scoring job')
    const plan = normalizePlan(profile.plan)
    const planLimits = getPlanLimits(plan)

    let scoreResult: Awaited<ReturnType<typeof scoreIntent>>
    let evidenceSignals: string[]
    if (existing) {
      scoreResult = {
        score: Number(existing.intent_score ?? 0),
        label: existing.intent_label as IntentLabel,
        flag: existing.flag ?? undefined,
        reasoning: existing.score_reasoning ?? 'Restored from a persisted scoring checkpoint.',
        usage: emptyAiUsage(),
      }
      evidenceSignals = existing.matched_signals ?? []
    } else {
      // 3. Reserve one monthly signal slot before paid AI work.
      const canProcessSignal = await reserveMonthlySignal(
        userId,
        planLimits.threadsPerMonth,
      )
      if (!canProcessSignal) {
        logger.info({ userId, plan }, 'Monthly signal limit reached')
        return
      }
      signalReserved = true

      // 4. Reserve provider spend and the daily intent allowance atomically.
      const intentSpend = await reserveAiSpend(supabase, {
        userId,
        purpose: 'intent',
        plan,
      })
      if (!intentSpend) {
        logger.warn({ userId, plan }, 'AI spend cap blocked intent scoring')
        await safelyReleaseMonthlySignal(userId)
        signalReserved = false
        return
      }

      let canScore: boolean
      try {
        canScore = await checkBudget(userId, profile.plan, 'intent')
      } catch (error) {
        await safelyReleaseAiSpend(intentSpend.id, { userId, purpose: 'intent' })
        throw error
      }
      if (!canScore) {
        await safelyReleaseAiSpend(intentSpend.id, { userId, purpose: 'intent' })
        logger.info({ userId }, 'Daily intent-scoring limit reached')
        await safelyReleaseMonthlySignal(userId)
        signalReserved = false
        return
      }

      // 5. Score intent and reconcile the reservation with actual usage.
      try {
        scoreResult = await scoreIntent(post, profile)
        await safelyRecordAiUsage(intentSpend.id, scoreResult.usage, {
          userId,
          purpose: 'intent',
        })
      } catch (error) {
        await settleFailedAiSpend(intentSpend.id, error, {
          userId,
          purpose: 'intent',
        })
        throw error
      }
      evidenceSignals = matchedSignals(`${post.title ?? ''} ${post.text ?? ''}`)
    }
    
    // Save thread early if score is low
    if (scoreResult.score < INTENT_THRESHOLD) {
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

    // Persist the paid intent result before drafting. A retry resumes from this
    // checkpoint and never pays to classify the same user/post twice.
    if (!existing) {
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
      draftResult = await draftReply(post, profile, scoreResult.score, trackingUrl)
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
      throw error
    }
    const draftText = draftResult.text

    // 7. Auto-send decision — routed through the single unified gatekeeper.
    //    All safeguards (disclosure, tone, cold-start, confidence threshold)
    //    are enforced inside evaluateAutoSend(). DO NOT inline duplicate logic here.
    const evaluation = await evaluateAutoSend(
      userId,
      post.platform,
      draftResult,
      {
        auto_send_enabled: profile.auto_send_enabled,
        auto_send_threshold: profile.auto_send_threshold,
        plan: profile.plan ?? 'free',
      },
      post.sourceTarget ?? null
    )

    if (evaluation.approved && ['reddit', 'bluesky'].includes(post.platform)) {
      // All gates cleared — save and enqueue for auto-send
      const autoSendPayload = {
        userId,
        threadExternalId: post.externalId,
        text: draftText,
        platform: post.platform as 'reddit' | 'bluesky',
        triggerType: 'auto' as const,
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
        const { notifySlackQueue, checkGoogleRankQueue } = await import('../../src/lib/queues/index.js')
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
        const { notifySlackQueue, checkGoogleRankQueue } = await import('../../src/lib/queues/index.js')
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
    logger.error({ error }, `Failed to score post ${post.externalId} for user ${userId}:`)
    throw error
  }
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

  const limits: Record<string, number> = {
    free: 50,
    pro: 500,
    growth: 2000,
  }
  
  const userPlan = limits[plan] ? plan : 'free'
  const limit = limits[userPlan]

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
  const { data: threadId, error } = await supabase.rpc('persist_scored_thread', {
    p_user_id: userId,
    p_keyword_id: keywordId,
    p_platform: post.platform,
    p_external_id: post.externalId,
    p_author: post.author,
    p_title: post.title || null,
    p_text_content: post.text,
    p_url: post.url,
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
