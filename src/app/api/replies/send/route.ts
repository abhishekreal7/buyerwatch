import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendReplyQueue } from '@/lib/queues'
import { getSendReplyJobId } from '@/lib/reply-jobs'

/**
 * POST /api/replies/send
 *
 * This route is for MANUAL sends only — it is triggered by the user clicking
 * "Approve & Post" in the UI. Since a human has explicitly reviewed and approved
 * the draft, the confidence engine is intentionally bypassed here; human approval
 * is the authorization, not an algorithmic score.
 *
 * The confidence engine (lib/confidence-engine.ts → evaluateAutoSend) is only
 * called from the background worker (worker/handlers/score-post.ts) for automated
 * send decisions. There must be no duplicate confidence math in this file.
 */
export async function POST(req: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { threadId, text } = await req.json()
  if (!threadId || typeof text !== 'string' || !text.trim() || text.length > 10_000) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: thread } = await supabase
    .from('monitored_threads')
    .select('external_id, platform, status')
    .eq('id', threadId)
    .eq('user_id', user.id)
    .single()

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  if (!['reddit', 'bluesky'].includes(thread.platform)) {
    return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 })
  }
  if (!['drafted', 'needs_manual_reply'].includes(thread.status)) {
    return NextResponse.json({ error: 'Thread is not sendable' }, { status: 409 })
  }

  // Enqueue the send job. Rate limiting is enforced downstream inside send-reply.ts worker.
  await sendReplyQueue.add('send', {
    userId: user.id,
    threadExternalId: thread.external_id,
    threadId,
    text: text.trim(),
    platform: thread.platform,
    triggerType: 'manual',
  }, {
    jobId: getSendReplyJobId(threadId),
  })

  return NextResponse.json({ success: true })
}
