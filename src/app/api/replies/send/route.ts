import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendReplyQueue } from '@/lib/queues'
import { getSendReplyJobId } from '@/lib/reply-jobs'
import { evaluateReplyQuality } from '@/lib/reply-quality'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { boundedString, isUuid, readJsonBody, RequestInputError } from '@/lib/request'

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
  try {
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

  const body = await readJsonBody<Record<string, unknown>>(req)
  const threadId = body.threadId
  const text = boundedString(body.text, 10_000, { required: true })
  if (!isUuid(threadId) || text === null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const rate = await actionRateLimit.limit(`reply-send:${user.id}:${await getIp()}`)
  if (!rate.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name')
    .eq('id', user.id)
    .single()
  if (!profile?.business_name) {
    return NextResponse.json({ error: 'Profile is incomplete' }, { status: 409 })
  }

  const replyText = text
  const quality = evaluateReplyQuality(replyText, {
    businessName: profile.business_name,
    platform: thread.platform,
  })
  if (quality.blocksAutomation) {
    return NextResponse.json({
      error: 'reply_quality_check_failed',
      issues: quality.issues,
    }, { status: 422 })
  }

  // Enqueue the send job. Rate limiting is enforced downstream inside send-reply.ts worker.
  const jobId = getSendReplyJobId(threadId)
  const existingJob = await sendReplyQueue.getJob(jobId)
  if (existingJob && await existingJob.isFailed()) {
    await existingJob.remove()
  }
  await sendReplyQueue.add('send', {
    userId: user.id,
    threadExternalId: thread.external_id,
    threadId,
    text: replyText,
    platform: thread.platform,
    triggerType: 'manual',
  }, {
    jobId,
  })

  return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[replies/send] Failed to enqueue reply', error)
    return NextResponse.json({ error: 'send_enqueue_failed' }, { status: 500 })
  }
}
