import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import {
  deliveryActivityPresentation,
  type DeliveryActivityState,
} from '@/lib/delivery-activity'
import { logger } from '@/lib/logger'
import { getSafeThreadUrl } from '@/lib/thread-url'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = getServiceRoleClient()
  const [threads, outbox, audits] = await Promise.all([
    admin.from('monitored_threads')
      .select('id, platform, title, url, status, created_at')
      .eq('user_id', user.id)
      .in('status', ['sending', 'send_reconciliation_required'])
      .order('created_at', { ascending: false }).limit(50),
    admin.from('job_outbox')
      .select('thread_id, status, last_error, created_at, dispatched_at, completed_at, permalink')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(50),
    admin.from('send_audit_log')
      .select('thread_id, platform, status, permalink, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(50),
  ])
  const error = threads.error ?? outbox.error ?? audits.error
  if (error) {
    logger.error({ error }, 'Unable to load delivery activity')
    return NextResponse.json({ error: 'activity_load_failed' }, { status: 500 })
  }
  const threadIds = [...new Set([
    ...(threads.data ?? []).map(row => row.id),
    ...(outbox.data ?? []).map(row => row.thread_id),
    ...(audits.data ?? []).map(row => row.thread_id),
  ])]
  const missingIds = threadIds.filter(id => !(threads.data ?? []).some(row => row.id === id))
  const missing = missingIds.length > 0
    ? await admin.from('monitored_threads').select('id, platform, title, url, status, created_at')
      .eq('user_id', user.id).in('id', missingIds)
    : { data: [], error: null }
  const byThread = new Map([...(threads.data ?? []), ...(missing.data ?? [])].map(row => [row.id, row]))
  const activity = threadIds.map(threadId => {
    const thread = byThread.get(threadId)
    const audit = (audits.data ?? []).find(row => row.thread_id === threadId)
    const job = (outbox.data ?? []).find(row => row.thread_id === threadId)
    let state: DeliveryActivityState | null = null
    if (audit?.status === 'success' || job?.status === 'completed') state = 'sent'
    else if (audit?.status === 'reconciliation_required' || thread?.status === 'send_reconciliation_required') state = 'uncertain'
    else if (audit?.status?.startsWith('failed') || job?.status === 'failed') state = 'failed'
    else if (job?.status === 'cancelled') state = 'cancelled'
    if (!state || !thread) return null
    const platform = thread.platform ?? audit?.platform ?? 'reddit'
    const threadUrl = getSafeThreadUrl({ platform, url: thread.url ?? null })
    const replyUrl = getSafeThreadUrl({
      platform,
      url: audit?.permalink ?? job?.permalink ?? null,
    })
    const presentation = deliveryActivityPresentation({
      state,
      threadId,
      threadUrl,
      replyUrl,
      cancellationReason: job?.last_error ?? null,
    })
    return {
      threadId,
      platform,
      title: presentation.title,
      subject: thread.title?.trim() || 'Original conversation',
      state,
      message: presentation.message,
      actionLabel: presentation.actionLabel,
      actionHref: presentation.actionHref,
      threadUrl,
      replyUrl,
      updatedAt: audit?.created_at ?? job?.completed_at ?? job?.dispatched_at ?? job?.created_at ?? thread?.created_at,
    }
  }).filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 30)
  return NextResponse.json({ activity }, { headers: { 'Cache-Control': 'no-store' } })
}
