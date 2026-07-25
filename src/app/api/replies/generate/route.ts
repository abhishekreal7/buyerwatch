import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { draftReply } from '@/lib/draft-reply'
import { NormalizedPost } from '@/lib/types'
import { getPlanLimits, normalizePlan } from '@/lib/plan-limits'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { threadId } = await req.json()
    if (!threadId) {
      return NextResponse.json({ error: 'Missing threadId' }, { status: 400 })
    }

    // 1. Fetch thread and user profile
    const { data: thread } = await supabase
      .from('monitored_threads')
      .select('*')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // 2. Enforce monthly AI draft limit
    const plan = normalizePlan(profile.plan)
    const limits = getPlanLimits(plan)
    const { data: reserved, error: reserveError } = await supabase.rpc('reserve_monthly_draft', {
      p_user_id: user.id,
      p_limit: limits.aiDraftsPerMonth,
    })

    if (reserveError) {
      return NextResponse.json({ error: 'draft_usage_check_failed' }, { status: 500 })
    }
    if (!reserved) {
      return NextResponse.json(
        { error: 'plan_limit_reached', limit: 'ai_drafts' },
        { status: 403 }
      )
    }

    // 3. Map thread to NormalizedPost format for drafting
    const post: NormalizedPost = {
      externalId: thread.external_id,
      platform: thread.platform,
      author: thread.author,
      text: thread.text_content,
      url: thread.url,
      createdAt: thread.created_at || new Date().toISOString(),
      sourceTarget: thread.keyword_text || thread.subreddit || '',
    }

    // 4. Draft reply
    const draftResult = await draftReply(post, profile, thread.intent_score || 0)
    
    // 5. Update thread status and save draft
    const { error: saveError } = await supabase.rpc('save_generated_draft', {
      p_user_id: user.id,
      p_thread_id: threadId,
      p_draft_text: draftResult.text,
    })
    if (saveError) {
      return NextResponse.json({ error: 'draft_save_failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, draft: draftResult.text })
  } catch (error) {
    console.error('Error generating draft:', error)
    return NextResponse.json({ error: 'draft_generation_failed' }, { status: 502 })
  }
}
