import { createClient } from '@supabase/supabase-js'
import { getRedditDiscoveryProviderKind, getRedditPostingProviderKind } from './env'
import { logger } from './logger'
import { redis } from './redis'
import { sendRedditDeliveryAlert } from './reddit-delivery-alerts'
import { fetchRedditApisAccountStatus } from './redditapis-client'
import {
  REDDITAPIS_BALANCE_STATE_KEY,
  type RedditApisBalanceState,
} from './redditapis-balance-state'

const CHECK_LOCK_KEY = 'monitor:redditapis:balance:check:v1'
const CHECK_INTERVAL_SECONDS = 15 * 60
const STATE_TTL_SECONDS = 90 * 24 * 60 * 60

export type RedditApisBalanceMonitorResult = {
  status: 'disabled' | 'skipped' | 'healthy' | 'low' | 'depleted' | 'unavailable'
  alerted: boolean
}

function configuredThreshold(): number {
  const parsed = Number(process.env.REDDITAPIS_LOW_BALANCE_USD?.trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.min(10_000, Math.max(0.01, parsed))
}

export function classifyRedditApisBalance(
  creditsRemaining: number,
  lowBalanceUsd = configuredThreshold(),
): RedditApisBalanceState {
  if (!Number.isFinite(creditsRemaining) || creditsRemaining < 0) {
    throw new Error('redditapis_balance_invalid')
  }
  if (creditsRemaining <= 0.05) return 'depleted'
  return creditsRemaining <= lowBalanceUsd ? 'low' : 'healthy'
}

function isRedditApisConfigured(): boolean {
  return getRedditDiscoveryProviderKind() === 'redditapis'
    || getRedditPostingProviderKind() === 'redditapis'
}

async function resolveRecoveredBalanceIncident(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await admin
    .from('service_incidents')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('platform', 'reddit')
    .eq('kind', 'credits_low')
    .is('user_id', null)
    .in('reason_code', ['redditapis_credits_low', 'redditapis_credits_exhausted'])
    .eq('status', 'open')
  if (error) throw error
}

/**
 * Checks RedditAPIs' free account endpoint at most once every 15 minutes.
 * Alerts fire only on a state transition, never on every scheduler run.
 */
export async function runRedditApisBalanceMonitor(): Promise<RedditApisBalanceMonitorResult> {
  if (!isRedditApisConfigured()) return { status: 'disabled', alerted: false }

  try {
    const locked = await redis.set(
      CHECK_LOCK_KEY,
      '1',
      'EX',
      CHECK_INTERVAL_SECONDS,
      'NX',
    )
    if (locked !== 'OK') return { status: 'skipped', alerted: false }
  } catch (error) {
    // Do not send a duplicate operator alert when Redis cannot protect the
    // transition. Discovery itself already fails closed in this condition.
    logger.warn({ error }, 'RedditAPIs balance monitor skipped: Redis unavailable')
    return { status: 'unavailable', alerted: false }
  }

  try {
    const { creditsRemaining } = await fetchRedditApisAccountStatus()
    const state = classifyRedditApisBalance(creditsRemaining)
    const previousState = await redis.get(REDDITAPIS_BALANCE_STATE_KEY) as RedditApisBalanceState | null
    let alerted = false

    if (state === 'healthy') {
      if (previousState === 'low' || previousState === 'depleted') {
        await resolveRecoveredBalanceIncident()
      }
    } else if (previousState !== state) {
      alerted = await sendRedditDeliveryAlert({
        kind: 'credits_low',
        code: state === 'depleted'
          ? 'redditapis_credits_exhausted'
          : 'redditapis_credits_low',
        detail: `RedditAPIs balance is ${state}. Add provider credit before Reddit monitoring is affected.`,
      })
      // If delivery is unavailable, retain the previous state so the next
      // guarded check can retry the operator alert.
      if (!alerted) return { status: state, alerted: false }
    }

    await redis.set(REDDITAPIS_BALANCE_STATE_KEY, state, 'EX', STATE_TTL_SECONDS)
    logger.info({ state }, 'RedditAPIs balance check completed')
    return { status: state, alerted }
  } catch (error) {
    logger.error({ error }, 'RedditAPIs balance monitor failed')
    return { status: 'unavailable', alerted: false }
  }
}
