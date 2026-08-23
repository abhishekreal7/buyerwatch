import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/admin'
import { logger } from '@/lib/logger'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getServiceRoleClient()
  const [sent, terminalFailures, conversations] = await Promise.all([
    admin.from('send_audit_log').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'success'),
    admin.from('send_audit_log').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).in('status', ['failed_retryable', 'failed_permanent']),
    admin.from('engagement_events').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('event_type', 'reply_confirmed').eq('source', 'reddit_reply_tracker'),
  ])
  const error = sent.error ?? terminalFailures.error ?? conversations.error
  if (error) {
    logger.error({ error }, 'Unable to load reply outcomes')
    return NextResponse.json({ error: 'reply_outcomes_load_failed' }, { status: 500 })
  }
  const sentCount = sent.count ?? 0
  const failureCount = terminalFailures.count ?? 0
  const totalResolved = sentCount + failureCount
  return NextResponse.json({
    deliverySuccessRate: totalResolved > 0 ? (sentCount / totalResolved) * 100 : null,
    conversationsStarted: conversations.count ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
