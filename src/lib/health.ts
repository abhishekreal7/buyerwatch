import { createClient } from '@supabase/supabase-js'
import { withTimeout } from './http'
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
    const { error } = await client.from('profiles').select('id', { head: true, count: 'exact' }).limit(1)
    if (error) throw new Error('database query failed')
  })

  const cache = await timedCheck('redis readiness', async () => {
    const result = await redis.ping()
    if (result !== 'PONG') throw new Error('redis ping failed')
  })

  return {
    ready: database.status === 'ok' && cache.status === 'ok',
    checks: { database, cache },
  }
}
