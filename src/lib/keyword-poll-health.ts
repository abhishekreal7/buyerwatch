import { createClient } from '@supabase/supabase-js'
import { redis } from './redis'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

function uniqueKeywordIds(keywordIds: string[]): string[] {
  return [...new Set(keywordIds.filter(Boolean))]
}

export function keywordPollErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLocaleLowerCase() : ''
  if (message.includes('daily_read_budget_exhausted')) return 'provider_budget_exhausted'
  if (message.includes('budget_guard_unavailable')) return 'provider_budget_guard_unavailable'
  if (message.includes('circuit_open')) return 'provider_circuit_open'
  if (message.includes('429') || message.includes('rate limit')) return 'source_rate_limited'
  if (message.includes('timeout') || message.includes('abort')) return 'source_timeout'
  if (message.includes('balance')) return 'provider_balance_unavailable'
  if (message.includes('authentication') || message.includes('unauthorized')) return 'provider_auth_failed'
  if (message.includes('all reddit fetch paths failed')) return 'reddit_sources_unavailable'
  if (message.includes('bluesky public search failed')) return 'bluesky_source_unavailable'
  return 'source_fetch_failed'
}

export async function recordKeywordPollSuccess(
  keywordIds: string[],
  checkedAt = new Date(),
): Promise<void> {
  const ids = uniqueKeywordIds(keywordIds)
  if (ids.length === 0) return

  const timestamp = checkedAt.toISOString()
  const { error } = await getAdminClient().rpc('record_keyword_poll_success_v1', {
    p_keyword_ids: ids,
    p_checked_at: timestamp,
  })
  if (error) throw new Error(`Unable to record keyword poll success: ${error.message}`)

  const pipeline = redis.pipeline()
  for (const keywordId of ids) {
    pipeline.set(`poll:keyword:${keywordId}`, timestamp, 'EX', 7 * 24 * 60 * 60)
  }
  // PostgreSQL is the canonical health state. A legacy Redis checkpoint is
  // only an operational cache and must not turn a successful source fetch into
  // a failed poll when Redis has a transient incident.
  await pipeline.exec().catch(() => undefined)
}

export async function recordKeywordPollFailure(
  keywordIds: string[],
  error: unknown,
  checkedAt = new Date(),
): Promise<void> {
  const ids = uniqueKeywordIds(keywordIds)
  if (ids.length === 0) return

  const { error: rpcError } = await getAdminClient().rpc('record_keyword_poll_failure_v1', {
    p_keyword_ids: ids,
    p_error_code: keywordPollErrorCode(error),
    p_checked_at: checkedAt.toISOString(),
  })
  if (rpcError) throw new Error(`Unable to record keyword poll failure: ${rpcError.message}`)

  // Remove legacy enqueue-time checkpoints. Only successful source fetches
  // are allowed to advance a keyword heartbeat now.
  const pipeline = redis.pipeline()
  for (const keywordId of ids) pipeline.del(`poll:keyword:${keywordId}`)
  await pipeline.exec().catch(() => undefined)
}
