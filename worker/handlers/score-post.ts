import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import { scoreIntent } from '../../src/lib/intent-scorer'
import { draftReply } from '../../src/lib/draft-reply'
import { evaluateAutoSend } from '../../src/lib/confidence-engine'
import { NormalizedPost } from '../../src/lib/types'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

const INTENT_THRESHOLD = 60

export async function scorePostHandler(job: Job) {
  const { userId, keywordId, post } = job.data as { userId: string; keywordId: string; post: NormalizedPost }

  try {
    // 1. Check if we already processed this exact post for this user
    const { data: existing } = await supabase
      .from('monitored_threads')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', post.platform)
      .eq('external_id', post.externalId)
      .maybeSingle()

    if (existing) return

    // 2. Fetch user profile for context and plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name, business_description, business_url, business_type, writing_style, plan, auto_send_enabled, auto_send_threshold')
      .eq('id', userId)
      .single()

    if (!profile) return

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
      await saveThread(userId, keywordId, post, scoreResult.score, 'dismissed', undefined, scoreResult.flag)
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

    // 6. Draft Reply
    const draftResult = await draftReply(post, profile, scoreResult.score)
    const draftText = draftResult.text

    // 7. Auto-send decision — routed through the single unified gatekeeper.
    //    All safeguards (disclosure, tone, cold-start, confidence threshold)
    //    are enforced inside evaluateAutoSend(). DO NOT inline duplicate logic here.
    const evaluation = await evaluateAutoSend(
      userId,
      post.platform,
      draftResult,
      profile,
      // targetCommunity must be the subreddit/hashtag name (e.g. "entrepreneur"),
      // NOT post.author (the post-author's username). community_trust_metrics rows
      // are keyed by target_community which stores the monitoring target.
      post.sourceTarget ?? null
    )

    if (evaluation.approved) {
      // All gates cleared — save and enqueue for auto-send
      const thread = await saveThread(userId, keywordId, post, scoreResult.score, 'drafted', draftText, scoreResult.flag)
      if (thread) {
        const { sendReplyQueue } = await import('../../src/lib/queues/index.js')
        await sendReplyQueue.add(`send-${thread.id}`, {
          userId,
          threadExternalId: post.externalId,
          threadId: thread.id,
          text: draftText,
          platform: post.platform,
          triggerType: 'auto'
        })
        logger.info({ userId, threadId: thread.id, reason: evaluation.reason, confidence: evaluation.automationConfidence, threshold: evaluation.dynamicThreshold }, 'Enqueued auto-send')
      }
    } else {
      // Any gate failed — route to manual review queue
      await saveThread(userId, keywordId, post, scoreResult.score, 'drafted', draftText, scoreResult.flag)
      logger.info({ userId, reason: evaluation.reason, confidence: evaluation.automationConfidence, threshold: evaluation.dynamicThreshold }, 'Routed to manual review')
    }

  } catch (error) {
    logger.error({ error }, `Failed to score post ${post.externalId} for user ${userId}:`)
    throw error
  }
}

async function checkBudget(userId: string, plan: string, service: 'gemini' | 'claude') {
  const limits: Record<string, Record<'gemini' | 'claude', number>> = {
    free: { gemini: 50, claude: 5 },
    pro: { gemini: 500, claude: 100 },
  }
  
  const userPlan = limits[plan] ? plan : 'free'
  const limit = limits[userPlan][service]

  const { data, error } = await supabase.rpc('increment_usage_if_under_limit', {
    p_user_id: userId,
    p_service: service,
    p_limit: limit,
  })

  if (error) {
    logger.error({ error }, 'Error checking budget:')
    return false // Fail safe: don't spend if RPC fails
  }

  return data
}

async function saveThread(userId: string, keywordId: string, post: NormalizedPost, intentScore: number, status: string, draftText?: string, flag?: string) {
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
      flag: flag || null
    })
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Error inserting monitored_thread:')
    return
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
      logger.error({ analyticsError }, 'Error inserting reply_analytics:')
    }
  }

  return thread
}
