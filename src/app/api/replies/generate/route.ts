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
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { count: draftsThisMonth, error: countError } = await supabase
      .from('reply_analytics')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart.toISOString())
      .not('draft_text', 'is', null)

    if (countError) {
      return NextResponse.json({ error: 'Failed to check draft usage' }, { status: 500 })
    }

    if ((draftsThisMonth ?? 0) >= limits.aiDraftsPerMonth) {
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
    await supabase
      .from('monitored_threads')
      .update({ status: 'drafted' })
      .eq('id', threadId)

    await supabase
      .from('reply_analytics')
      .insert({
        user_id: user.id,
        thread_id: threadId,
        draft_text: draftResult.text,
      })

    return NextResponse.json({ success: true, draft: draftResult.text })
  } catch (error: any) {
    console.error('Error generating draft:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
