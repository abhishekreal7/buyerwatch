import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { boundedString, isUuid, readJsonBody, RequestInputError } from '@/lib/request'
import { recordEngagementEvent } from '@/lib/automation-audit'

function readOriginalDraft(value: unknown): string {
  if (Array.isArray(value)) return String(value[0]?.draft_text ?? '')
  if (value && typeof value === 'object' && 'draft_text' in value) {
    return String((value as { draft_text?: unknown }).draft_text ?? '')
  }
  return ''
}

async function recordManualConfirmation(input: {
  userId: string
  threadId: string
  platform: string
  text: string
  permalink: string | null
  originalDraft: string
}) {
  const admin = getServiceRoleClient()
  const actionType = input.originalDraft === input.text ? 'APPROVED' : 'EDITED_APPROVED'
  const { error: feedbackError } = await admin.rpc('log_verified_draft_feedback', {
    p_user_id: input.userId,
    p_thread_id: input.threadId,
    p_final_draft: input.text,
    p_action_type: actionType,
  })
  if (feedbackError) {
    console.error('[replies/mark-posted] Reply confirmed but feedback failed', feedbackError)
  }
  await recordEngagementEvent(admin, {
    userId: input.userId,
    threadId: input.threadId,
    eventType: 'reply_confirmed',
    platform: input.platform,
    actorType: 'user',
    source: 'manual_confirmation',
    metadata: { permalink: input.permalink, actionType },
    idempotencyKey: `${input.threadId}:reply-confirmed`,
  }).catch((auditError) => {
    console.error('[replies/mark-posted] Confirmation audit failed', auditError)
  })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await readJsonBody<Record<string, unknown>>(request)
    const threadId = body.threadId
    const text = boundedString(body.text, 10_000, { required: true, trim: false })
    const permalink = boundedString(body.permalink, 2_000)
    if (!isUuid(threadId) || text === null) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const rate = await actionRateLimit.limit(`reply-mark-posted:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const { data: ownedThread } = await supabase
      .from('monitored_threads')
      .select('platform, reply_analytics(draft_text)')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()
    if (!ownedThread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    const { data, error } = await supabase.rpc('mark_thread_manually_replied_v2', {
      p_thread_id: threadId,
      p_final_text: text,
      p_permalink: permalink,
    })
    if (!error && data === true) {
      await recordManualConfirmation({
        userId: user.id,
        threadId,
        platform: ownedThread.platform,
        text,
        permalink,
        originalDraft: readOriginalDraft(ownedThread.reply_analytics),
      })
      return NextResponse.json({ success: true })
    }

    // Backward-compatible release path while the v2 migration is rolling out.
    // The legacy RPC still performs the ownership check using auth.uid().
    const missingFunction = error?.code === 'PGRST202'
      || error?.message?.includes('mark_thread_manually_replied_v2')
    if (!missingFunction) {
      console.error('[replies/mark-posted] Failed', error)
      return NextResponse.json({ error: 'mark_posted_failed' }, { status: 500 })
    }

    const legacy = await supabase.rpc('mark_thread_manually_replied', {
      p_thread_id: threadId,
    })
    if (legacy.error) {
      console.error('[replies/mark-posted] Legacy fallback failed', legacy.error)
      return NextResponse.json({ error: 'mark_posted_failed' }, { status: 500 })
    }
    if (legacy.data !== true) {
      return NextResponse.json({ error: 'thread_not_sendable' }, { status: 409 })
    }

    const admin = getServiceRoleClient()
    const [{ error: analyticsError }, { error: auditError }] = await Promise.all([
      admin
        .from('reply_analytics')
        .update({ edited_text: text })
        .eq('thread_id', threadId)
        .eq('user_id', user.id),
      admin.from('send_audit_log').insert({
        user_id: user.id,
        thread_id: threadId,
        platform: ownedThread.platform,
        trigger_type: 'manual',
        status: 'success',
        permalink: permalink || null,
      }),
    ])
    if (analyticsError || auditError) {
      console.error('[replies/mark-posted] Legacy audit fallback incomplete', {
        analyticsError,
        auditError,
      })
    }
    await recordManualConfirmation({
      userId: user.id,
      threadId,
      platform: ownedThread.platform,
      text,
      permalink,
      originalDraft: readOriginalDraft(ownedThread.reply_analytics),
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'mark_posted_failed' }, { status: 500 })
  }
}
