import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { draftReply } from '@/lib/draft-reply'

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

    // 2. Map thread to NormalizedPost format for drafting
    const post = {
      externalId: thread.external_id,
      platform: thread.platform,
      author: thread.author,
      text: thread.text_content,
      url: thread.url,
      timestamp: thread.created_at,
    }

    // 3. Draft reply
    const draftResult = await draftReply(post, profile, thread.intent_score || 0)
    
    // 4. Update thread status and save draft
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
