import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { scoreIntent } from '../../src/lib/intent-scorer'
import { draftReply } from '../../src/lib/draft-reply'
import { evaluateAutoSend } from '../../src/lib/confidence-engine'
import { NormalizedPost } from '../../src/lib/types'
import * as dotenv from 'dotenv'
import path from 'path'
import { randomBytes } from 'crypto'
import { getSendReplyJobId } from '../../src/lib/reply-jobs'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

const INTENT_THRESHOLD = 60

export async function scorePostHandler(job: Job) {
  const { userId, keywordId, post } = job.data as { userId: string; keywordId: string; post: NormalizedPost }

  try {
    // 1. Check if we already processed this exact post for this user
    const { data: existing, error: existingError } = await supabase
      .from('monitored_threads')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', post.platform)
      .eq('external_id', post.externalId)
      .maybeSingle()

    if (existingError) throw existingError
    if (existing) return

    // 2. Fetch user profile for context and plan
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('business_name, business_description, business_url, business_type, writing_style, plan, auto_send_enabled, auto_send_threshold, referral_tracking_enabled')
      .eq('id', userId)
      .single()

    if (profileError) throw profileError
    if (!profile) throw new Error('Profile not found for scoring job')

    // 3. Atomic Budget Check for Scoring (Gemini)
    const canScore = await checkBudget(userId, profile.plan, 'gemini')
    if (!canScore) {
      logger.info(`[Budget] User ${userId} exceeded gemini limit.`)
      return // Silent skip
    }

    // 4. Score intent
    const scoreResult = await scoreIntent(post, profile)
    
    // Save thread early if score is low
    if (scoreResult.score < INTENT_THRESHOLD) {
      await saveThread(userId, keywordId, post, scoreResult.score, 'dismissed', undefined, scoreResult.flag, scoreResult.reasoning)
      return
    }

    // 5. Atomic Budget Check for Drafting (Claude)
    const canDraft = await checkBudget(userId, profile.plan, 'claude')
    if (!canDraft) {
      logger.info(`[Budget] User ${userId} exceeded claude limit.`)
      // Save as needs manual reply
      await saveThread(userId, keywordId, post, scoreResult.score, 'needs_manual_reply', undefined, scoreResult.flag)
      return
    }

    // 6. Draft Reply — generate tracking SID before drafting so Claude can embed it naturally
    const trackingEnabled = profile.referral_tracking_enabled !== false // default true
    const trackingSid = trackingEnabled ? randomBytes(5).toString('base64url') : undefined // ~7-char URL-safe token
    const trackingUrl = trackingEnabled && profile.business_url && trackingSid
      ? `${profile.business_url.replace(/\/$/, '')}?ref=scouto&sid=${trackingSid}`
      : undefined

    const draftResult = await draftReply(post, profile, scoreResult.score, trackingUrl)
    const draftText = draftResult.text

    // 7. Auto-send decision — routed through the single unified gatekeeper.
    //    All safeguards (disclosure, tone, cold-start, confidence threshold)
    //    are enforced inside evaluateAutoSend(). DO NOT inline duplicate logic here.
    const evaluation = await evaluateAutoSend(
      userId,
      post.platform,
      draftResult,
      { auto_send_enabled: profile.auto_send_enabled, plan: profile.plan ?? 'free' },
      post.sourceTarget ?? null
    )

    if (evaluation.approved) {
      // All gates cleared — save and enqueue for auto-send
      const thread = await saveThread(userId, keywordId, post, scoreResult.score, 'drafted', draftText, scoreResult.flag, scoreResult.reasoning, trackingSid)
      if (thread) {
        const { sendReplyQueue, notifySlackQueue, checkGoogleRankQueue } = await import('../../src/lib/queues/index.js')
        await sendReplyQueue.add('send', {
          userId,
          threadExternalId: post.externalId,
          threadId: thread.id,
          text: draftText,
          platform: post.platform,
          triggerType: 'auto',
        }, {
          jobId: getSendReplyJobId(thread.id),
        })
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
      const thread = await saveThread(userId, keywordId, post, scoreResult.score, 'drafted', draftText, scoreResult.flag, scoreResult.reasoning, trackingSid)
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
    logger.error({ error }, `Failed to score post ${post.externalId} for user ${userId}:`)
    throw error
  }
}

async function checkBudget(userId: string, plan: string, service: 'gemini' | 'claude') {
  const limits: Record<string, Record<'gemini' | 'claude', number>> = {
    free:   { gemini: 50,   claude: 40 },   // 40 aligns with plan-limits.ts free.aiDraftsPerMonth
    pro:    { gemini: 500,  claude: 400 },
    growth: { gemini: 2000, claude: 2000 },
  }
  
  const userPlan = limits[plan] ? plan : 'free'
  const limit = limits[userPlan][service]

  const { data, error } = await supabase.rpc('increment_usage_if_under_limit', {
    p_user_id: userId,
    p_service: service,
    p_limit: limit,
  })

  if (error) {
    throw new Error(`Budget reservation failed: ${error.message}`)
  }

  return data
}

async function saveThread(userId: string, keywordId: string, post: NormalizedPost, intentScore: number, status: string, draftText?: string, flag?: string, reasoning?: string, trackingSid?: string) {
  const { data: thread, error } = await supabase
    .from('monitored_threads')
    .insert({
      user_id: userId,
      keyword_id: keywordId,
      platform: post.platform,
      external_id: post.externalId,
      author: post.author,
      text_content: post.text,
      url: post.url,
      intent_score: intentScore,
      status: status,
      flag: flag || null,
      score_reasoning: reasoning || null,
      tracking_sid: trackingSid || null,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to persist monitored thread: ${error.message}`)
  }

  if (draftText && thread) {
    const { error: analyticsError } = await supabase
      .from('reply_analytics')
      .insert({
        user_id: userId,
        thread_id: thread.id,
        draft_text: draftText,
      })
      
    if (analyticsError) {
      throw new Error(`Failed to persist reply analytics: ${analyticsError.message}`)
    }
  }

  return thread
}
