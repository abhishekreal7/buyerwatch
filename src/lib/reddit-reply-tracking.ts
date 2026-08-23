import { getServiceRoleClient } from './admin'
import { recordEngagementEvent } from './automation-audit'
import { getRedditDiscoveryProviderKind } from './env'
import { logger } from './logger'
import { fetchRedditCommentReplies, RedditApisRequestError } from './redditapis-client'
import { parseRedditCommentIdFromPermalink } from './redditapis-contract'
import { redis } from './redis'

const RUN_LOCK_KEY = 'monitor:reddit-reply-tracking:due:v1'
const CURSOR_KEY = 'cursor:reddit-reply-tracking:audit:v1'
const DEFAULT_INTERVAL_MINUTES = 60
const MAX_TRACKING_AGE_DAYS = 14

export type RedditReplyTrackingResult = {
  status: 'disabled' | 'skipped' | 'checked' | 'unavailable'
  checkedAuditId?: string
  conversationsStarted?: number
}

function intervalSeconds(): number {
  const raw = Number(process.env.REDDIT_REPLY_TRACKING_INTERVAL_MINUTES)
  const minutes = Number.isSafeInteger(raw) && raw >= 15 && raw <= 360
    ? raw
    : DEFAULT_INTERVAL_MINUTES
  return minutes * 60
}

function trackingEnabled(): boolean {
  return process.env.REDDIT_REPLY_TRACKING_ENABLED !== 'false'
    && getRedditDiscoveryProviderKind() === 'redditapis'
}

type SentAudit = {
  id: string
  user_id: string
  thread_id: string
  permalink: string | null
  created_at: string
}

/**
 * Checks one recent, verified Reddit send per interval in round-robin order.
 * This gives real tracking while bounding RedditAPIs reads and therefore cost.
 */
export async function runRedditReplyTracker(): Promise<RedditReplyTrackingResult> {
  if (!trackingEnabled()) return { status: 'disabled' }

  const lease = await redis.set(RUN_LOCK_KEY, 'running', 'EX', intervalSeconds(), 'NX')
    .catch((error) => {
      logger.warn({ error }, 'Reddit reply tracker skipped: Redis unavailable')
      return null
    })
  if (lease !== 'OK') return { status: 'skipped' }

  try {
    const admin = getServiceRoleClient()
    const oldest = new Date(Date.now() - MAX_TRACKING_AGE_DAYS * 24 * 60 * 60 * 1_000).toISOString()
    const settled = new Date(Date.now() - 5 * 60 * 1_000).toISOString()
    const [{ data: audits, error: auditError }, { data: connections, error: connectionError }, { data: existing, error: existingError }] = await Promise.all([
      admin.from('send_audit_log')
        .select('id, user_id, thread_id, permalink, created_at')
        .eq('platform', 'reddit').eq('status', 'success')
        .not('permalink', 'is', null)
        .gte('created_at', oldest).lte('created_at', settled)
        .order('created_at', { ascending: true }).limit(250),
      admin.from('platform_connections')
        .select('user_id, external_username')
        .eq('platform', 'reddit'),
      admin.from('engagement_events')
        .select('metadata')
        .eq('event_type', 'reply_confirmed')
        .eq('source', 'reddit_reply_tracker')
        .gte('occurred_at', oldest).limit(500),
    ])
    if (auditError) throw auditError
    if (connectionError) throw connectionError
    if (existingError) throw existingError

    const trackedCommentIds = new Set(
      (existing ?? []).flatMap(({ metadata }) => {
        const id = metadata && typeof metadata === 'object'
          ? (metadata as Record<string, unknown>).outboundCommentId
          : null
        return typeof id === 'string' ? [id.toLowerCase()] : []
      }),
    )
    const candidates = (audits ?? []).flatMap((audit) => {
      const commentId = parseRedditCommentIdFromPermalink(audit.permalink)
      return commentId && !trackedCommentIds.has(commentId)
        ? [{ ...audit, commentId }]
        : []
    }) as Array<SentAudit & { commentId: string }>
    if (candidates.length === 0) return { status: 'checked', conversationsStarted: 0 }

    const cursor = await redis.get(CURSOR_KEY).catch(() => null)
    const cursorIndex = candidates.findIndex(candidate => candidate.id === cursor)
    const candidate = candidates[(cursorIndex + 1 + candidates.length) % candidates.length]
    await redis.set(CURSOR_KEY, candidate.id, 'EX', 30 * 24 * 60 * 60)

    const accountNames = new Map(
      (connections ?? []).flatMap(connection => {
        const username = connection.external_username?.trim().toLowerCase()
        return username ? [[connection.user_id, username] as const] : []
      }),
    )
    const replies = await fetchRedditCommentReplies(candidate.commentId)
    const ownUsername = accountNames.get(candidate.user_id)
    const externalReplies = replies.filter(reply => reply.author.toLowerCase() !== ownUsername)
    if (externalReplies.length === 0) {
      return { status: 'checked', checkedAuditId: candidate.id, conversationsStarted: 0 }
    }

    const firstReply = externalReplies[0]
    await recordEngagementEvent(admin, {
      userId: candidate.user_id,
      threadId: candidate.thread_id,
      eventType: 'reply_confirmed',
      platform: 'reddit',
      actorType: 'provider',
      source: 'reddit_reply_tracker',
      metadata: {
        direction: 'inbound',
        outboundCommentId: candidate.commentId,
        incomingCommentId: firstReply.commentId,
        incomingAuthor: firstReply.author,
        replyCount: externalReplies.length,
      },
      idempotencyKey: `conversation-started:${candidate.commentId}`,
      occurredAt: firstReply.createdAt ?? undefined,
    })
    logger.info({ auditId: candidate.id, replyCount: externalReplies.length }, 'Reddit conversation started')
    return { status: 'checked', checkedAuditId: candidate.id, conversationsStarted: 1 }
  } catch (error) {
    const code = error instanceof RedditApisRequestError ? error.code : 'reply_tracking_failed'
    logger.warn({ error, code }, 'Reddit reply tracker could not complete')
    return { status: 'unavailable' }
  }
}
