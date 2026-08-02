import { createClient } from '@supabase/supabase-js'
import { withTimeout } from './http'
import { PLAN_POLL_INTERVAL_MINUTES, normalizePlan } from './plan-limits'
import { hasQStashConfiguration } from './qstash'
import { redis } from './redis'

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

export async function checkApplicationReadiness() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const database = await timedCheck('database readiness', async () => {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('database configuration missing')
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const [profiles, threads, ingestion, spend] = await Promise.all([
      client.from('profiles').select('id, signal_count, signal_month', { head: true }).limit(1),
      client
        .from('monitored_threads')
        .select('id, title, intent_label, score_reasoning, matched_signals, quality_issues, automation_reason', { head: true })
        .limit(1),
      client.from('ingestion_events').select('id, processed_at', { head: true }).limit(1),
      client.from('ai_spend_reservations').select('id, status', { head: true }).limit(1),
    ])
    if (profiles.error || threads.error || ingestion.error || spend.error) {
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

  return {
    ready:
      database.status === 'ok'
      && cache.status === 'ok'
      && monitoring.status === 'ok',
    checks: { database, cache, monitoring },
  }
}
