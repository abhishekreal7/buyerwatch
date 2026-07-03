import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import { scoreIntent } from '../../src/lib/intent-scorer'
import { draftReply } from '../../src/lib/draft-reply'
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
      .select('business_name, business_description, business_url, business_type, writing_style, plan')
      .eq('id', userId)
      .single()

    if (!profile) return

    // 3. Atomic Budget Check for Scoring (Gemini)
    const canScore = await checkBudget(userId, profile.plan, 'gemini')
    if (!canScore) {
      console.log(`[Budget] User ${userId} exceeded gemini limit.`)
      return // Silent skip
    }

    // 4. Score intent
    const scoreResult = await scoreIntent(post, profile)
    
    // Save thread early if score is low
    if (scoreResult.score < INTENT_THRESHOLD) {
      await saveThread(userId, keywordId, post, scoreResult.score, 'dismissed')
      return
    }

    // 5. Atomic Budget Check for Drafting (Claude)
    const canDraft = await checkBudget(userId, profile.plan, 'claude')
    if (!canDraft) {
      console.log(`[Budget] User ${userId} exceeded claude limit.`)
      // Save as needs manual reply
      await saveThread(userId, keywordId, post, scoreResult.score, 'needs_manual_reply')
      return
    }

    // 6. Draft Reply
    const draftText = await draftReply(post, profile, scoreResult.score)
    await saveThread(userId, keywordId, post, scoreResult.score, 'drafted', draftText)

  } catch (error) {
    console.error(`Failed to score post ${post.externalId} for user ${userId}:`, error)
    throw error
  }
}

async function checkBudget(userId: string, plan: string, service: 'gemini' | 'claude') {
  const limits: Record<string, Record<'gemini' | 'claude', number>> = {
    free: { gemini: 50, claude: 5 },
    pro: { gemini: 500, claude: 100 },
    business: { gemini: 2000, claude: 500 },
  }
  
  const userPlan = limits[plan] ? plan : 'free'
  const limit = limits[userPlan][service]

  const { data, error } = await supabase.rpc('increment_usage_if_under_limit', {
    p_user_id: userId,
    p_service: service,
    p_limit: limit,
  })

  if (error) {
    console.error('Error checking budget:', error)
    return false // Fail safe: don't spend if RPC fails
  }

  return data
}

async function saveThread(
  userId: string, 
  keywordId: string, 
  post: NormalizedPost, 
  intentScore: number, 
  status: string,
  draftText?: string
) {
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
      status: status
    })
    .select()
    .single()

  if (error) {
    console.error('Error inserting monitored_thread:', error)
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
      console.error('Error inserting reply_analytics:', analyticsError)
    }
  }
}
