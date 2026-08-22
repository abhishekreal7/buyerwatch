import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

type State = 'queued' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'cancelled'

function customerMessage(state: State) {
  if (state === 'queued') return 'Waiting for a safe delivery attempt.'
  if (state === 'sending') return 'Delivery is in progress.'
  if (state === 'sent') return 'Reply delivery was confirmed.'
  if (state === 'uncertain') return 'Check the original thread before retrying.'
  if (state === 'cancelled') return 'Delivery was stopped safely and will not retry automatically.'
  return 'Delivery did not complete. No automatic retry is pending.'
}

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
      .select('thread_id, status, created_at, dispatched_at, completed_at, permalink')
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
    let state: State = 'queued'
    if (audit?.status === 'success' || job?.status === 'completed') state = 'sent'
    else if (audit?.status === 'reconciliation_required' || thread?.status === 'send_reconciliation_required') state = 'uncertain'
    else if (audit?.status?.startsWith('failed') || job?.status === 'failed') state = 'failed'
    else if (job?.status === 'cancelled') state = 'cancelled'
    else if (thread?.status === 'sending' || job?.status === 'dispatched') state = 'sending'
    return {
      threadId,
      platform: thread?.platform ?? audit?.platform ?? 'reddit',
      title: thread?.title?.trim() || 'Reply delivery',
      state,
      message: customerMessage(state),
      threadUrl: thread?.url ?? null,
      replyUrl: audit?.permalink ?? job?.permalink ?? null,
      updatedAt: audit?.created_at ?? job?.completed_at ?? job?.dispatched_at ?? job?.created_at ?? thread?.created_at,
    }
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 30)
  return NextResponse.json({ activity }, { headers: { 'Cache-Control': 'no-store' } })
}
