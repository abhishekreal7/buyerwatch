import { getServiceRoleClient } from './admin'
import {
  findHyperbrowserRedditReply,
  HyperbrowserRedditError,
} from './hyperbrowser-reddit'
import { logger } from './logger'
import { publishQStashJson } from './qstash'
import { getRedditDeliveryFlowControl } from './reddit-delivery-concurrency'
import { getActiveRedditSession } from './reddit-session'

export type RedditReconciliationMessage = {
  userId: string
  threadId: string
  attempt: 1 | 2 | 3
}

export type RedditReconciliationResult = {
  status: 'resolved' | 'not_pending' | 'still_uncertain'
  attempt: number
}

function followUpDelaySeconds(attempt: 1 | 2): number {
  return attempt === 1 ? 4 * 60 : 15 * 60
}

export async function scheduleRedditReplyReconciliation(
  message: RedditReconciliationMessage,
  delaySeconds = 60,
): Promise<string | null> {
  return publishQStashJson('/api/jobs/reconcile-reddit', message, {
    retries: 2,
    timeout: '4m',
    delay: Math.max(1, delaySeconds),
    flowControl: getRedditDeliveryFlowControl('reddit'),
  })
}

export async function reconcileRedditReply(
  message: RedditReconciliationMessage,
): Promise<RedditReconciliationResult> {
  const admin = getServiceRoleClient()
  const { data: pendingAudit, error: auditError } = await admin
    .from('send_audit_log')
    .select('id')
    .eq('user_id', message.userId)
    .eq('thread_id', message.threadId)
    .eq('platform', 'reddit')
    .eq('status', 'reconciliation_required')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (auditError) throw auditError
  if (!pendingAudit) return { status: 'not_pending', attempt: message.attempt }

  const [{ data: thread, error: threadError }, { data: reply, error: replyError }] = await Promise.all([
    admin
      .from('monitored_threads')
      .select('url')
      .eq('id', message.threadId)
      .eq('user_id', message.userId)
      .eq('platform', 'reddit')
      .eq('status', 'send_reconciliation_required')
      .maybeSingle(),
    admin
      .from('reply_analytics')
      .select('edited_text, draft_text')
      .eq('thread_id', message.threadId)
      .eq('user_id', message.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (threadError) throw threadError
  if (replyError) throw replyError
  if (!thread?.url || !reply) return { status: 'not_pending', attempt: message.attempt }

  const text = (reply.edited_text || reply.draft_text || '').trim()
  if (!text) return { status: 'not_pending', attempt: message.attempt }
  const session = await getActiveRedditSession(message.userId)
  if (session.provider !== 'hyperbrowser') {
    return { status: 'still_uncertain', attempt: message.attempt }
  }

  const confirmation = await findHyperbrowserRedditReply({
    postUrl: thread.url,
    text,
    username: session.username,
    profileId: session.profileId,
  })
  if (confirmation) {
    const { data: resolution, error: resolutionError } = await admin.rpc(
      'resolve_send_reconciliation_automatically_v1',
      {
        p_thread_id: message.threadId,
        p_user_id: message.userId,
        p_permalink: confirmation.permalink,
      },
    )
    if (resolutionError) throw resolutionError
    if (resolution === 'resolved' || resolution === 'not_pending') {
      return { status: resolution === 'resolved' ? 'resolved' : 'not_pending', attempt: message.attempt }
    }
  }

  if (message.attempt < 3) {
    const nextAttempt = (message.attempt + 1) as 2 | 3
    const delaySeconds = followUpDelaySeconds(message.attempt as 1 | 2)
    const messageId = await scheduleRedditReplyReconciliation(
      { ...message, attempt: nextAttempt },
      delaySeconds,
    )
    if (!messageId) {
      logger.warn({ threadId: message.threadId }, 'QStash unavailable; Reddit reconciliation remains manual')
    }
  }
  return { status: 'still_uncertain', attempt: message.attempt }
}

export function isRetryableReconciliationError(error: unknown): boolean {
  return !(error instanceof HyperbrowserRedditError) || error.retryable
}
