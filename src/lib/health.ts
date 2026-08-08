import { createClient } from '@supabase/supabase-js'
import { withRedisLock } from './backend-maintenance'
import { hasRedditPostingProvider } from './env'
import { withTimeout } from './http'
import { PLAN_POLL_INTERVAL_MINUTES, normalizePlan } from './plan-limits'
import { hasQStashConfiguration } from './qstash'
import { redis } from './redis'
import { fetchRedditApisAccountStatus } from './redditapis-client'

const REDDIT_PROVIDER_HEALTH_KEY = 'health:redditapis:v1'
const REDDIT_PROVIDER_HEALTH_LOCK_KEY = 'lock:health:redditapis:v1'
const REDDIT_PROVIDER_HEALTH_TTL_SECONDS = 300
const MINIMUM_REDDIT_PROVIDER_CREDITS = 0.02

export interface ReadinessCheck {
  status: 'ok' | 'error'
  latencyMs: number
  detail?: string
}

async function timedCheck(
  label: string,
  operation: () => Promise<unknown>,
): Promise<ReadinessCheck> {
  const startedAt = Date.now()
  try {
    await withTimeout(operation(), 3_000, label)
    return { status: 'ok', latencyMs: Date.now() - startedAt }
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - startedAt,
      detail: process.env.NODE_ENV === 'production'
        ? `${label} failed`
        : error instanceof Error
          ? error.message.slice(0, 160)
          : `${label} failed`,
    }
  }
}

type ProviderHealthSnapshot = {
  status: 'ok' | 'error'
  checkedAt: string
}

function parseProviderHealthSnapshot(value: string | null): ProviderHealthSnapshot | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<ProviderHealthSnapshot>
    if (
      (parsed.status === 'ok' || parsed.status === 'error')
      && typeof parsed.checkedAt === 'string'
      && Number.isFinite(Date.parse(parsed.checkedAt))
    ) {
      return { status: parsed.status, checkedAt: parsed.checkedAt }
    }
  } catch {
    // Ignore corrupt operational cache entries and perform a fresh check.
  }
  return null
}

async function checkRedditProviderReadiness(): Promise<ReadinessCheck> {
  if (!hasRedditPostingProvider()) {
    return { status: 'ok', latencyMs: 0, detail: 'disabled' }
  }

  const startedAt = Date.now()
  let cached: ProviderHealthSnapshot | null = null
  try {
    cached = parseProviderHealthSnapshot(await redis.get(REDDIT_PROVIDER_HEALTH_KEY))
  } catch {
    return {
      status: 'error',
      latencyMs: Date.now() - startedAt,
      detail: 'reddit provider health cache unavailable',
    }
  }
  if (cached && Date.now() - Date.parse(cached.checkedAt) < REDDIT_PROVIDER_HEALTH_TTL_SECONDS * 1_000) {
    return {
      status: cached.status,
      latencyMs: Date.now() - startedAt,
      ...(cached.status === 'error' ? { detail: 'reddit provider unavailable' } : {}),
    }
  }

  const checked = await withRedisLock(
    redis,
    REDDIT_PROVIDER_HEALTH_LOCK_KEY,
    10_000,
    async (): Promise<ProviderHealthSnapshot> => {
      let snapshot: ProviderHealthSnapshot
      try {
        const account = await fetchRedditApisAccountStatus()
        snapshot = {
          status: account.creditsRemaining >= MINIMUM_REDDIT_PROVIDER_CREDITS ? 'ok' : 'error',
          checkedAt: new Date().toISOString(),
        }
      } catch {
        snapshot = { status: 'error', checkedAt: new Date().toISOString() }
      }
      await redis.set(
        REDDIT_PROVIDER_HEALTH_KEY,
        JSON.stringify(snapshot),
        'EX',
        snapshot.status === 'ok' ? REDDIT_PROVIDER_HEALTH_TTL_SECONDS : 60,
      )
      return snapshot
    },
  )

  // Another instance owns the check. A recent stale value is safer than
  // stampeding the provider's free account endpoint; without one, report a
  // short-lived degraded state and let the next probe use the cached result.
  const snapshot = checked ?? cached
  return {
    status: snapshot?.status ?? 'error',
    latencyMs: Date.now() - startedAt,
    ...(snapshot?.status === 'ok' ? {} : { detail: 'reddit provider unavailable' }),
  }
}

export async function checkApplicationReadiness() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const database = await timedCheck('database readiness', async () => {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('database configuration missing')
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const [profiles, threads, ingestion, spend, redditConnections] = await Promise.all([
      client.from('profiles').select('id, signal_count, signal_month', { head: true }).limit(1),
      client
        .from('monitored_threads')
        .select('id, title, intent_label, score_reasoning, matched_signals, quality_issues, automation_reason', { head: true })
        .limit(1),
      client.from('ingestion_events').select('id, processed_at', { head: true }).limit(1),
      client.from('ai_spend_reservations').select('id, status', { head: true }).limit(1),
      client.from('reddit_connection_secrets').select('connection_id, status', { head: true }).limit(1),
    ])
    if (profiles.error || threads.error || ingestion.error || spend.error || redditConnections.error) {
      throw new Error('database schema is behind required migrations')
    }
  })

  const cache = await timedCheck('redis readiness', async () => {
    const result = await redis.ping()
    if (result !== 'PONG') throw new Error('redis ping failed')
  })

  const monitoring = await timedCheck('monitoring readiness', async () => {
    if (!hasQStashConfiguration()) {
      throw new Error('QStash configuration missing')
    }
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('database configuration missing')
    }

    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client
      .from('keywords')
      .select('user_id, profiles!inner(plan, last_polled_at)')
      .in('platform', ['reddit', 'bluesky'])
      .eq('is_active', true)
      .limit(500)
    if (error) throw new Error('monitoring freshness query failed')

    const now = Date.now()
    const checkedUsers = new Set<string>()
    for (const row of data ?? []) {
      if (checkedUsers.has(row.user_id)) continue
      checkedUsers.add(row.user_id)
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
      const lastPolledAt = Date.parse(profile?.last_polled_at ?? '')
      const interval = PLAN_POLL_INTERVAL_MINUTES[normalizePlan(profile?.plan)]
      const staleAfterMs = (interval * 3 + 10) * 60_000
      if (!Number.isFinite(lastPolledAt) || now - lastPolledAt > staleAfterMs) {
        throw new Error('monitoring heartbeat stale')
      }
    }
  })

  const redditProvider = cache.status === 'ok'
    ? await checkRedditProviderReadiness()
    : { status: 'error' as const, latencyMs: 0, detail: 'cache unavailable' }

  return {
    ready:
      database.status === 'ok'
      && cache.status === 'ok'
      && monitoring.status === 'ok'
      && redditProvider.status === 'ok',
    checks: { database, cache, monitoring, redditProvider },
  }
}
