import { getServiceRoleClient } from './admin'
import { getRedditPostingProviderKind } from './env'
import {
  fetchHyperbrowserCreditInfo,
  fetchHyperbrowserRedditAccountProfile,
  HyperbrowserRedditError,
} from './hyperbrowser-reddit'
import { logger } from './logger'
import { sendRedditDeliveryAlert } from './reddit-delivery-alerts'
import { getHyperbrowserRedditMaxConcurrency } from './reddit-delivery-concurrency'
import { recordHyperbrowserHealth } from './reddit-delivery-health'
import { redis } from './redis'
import { withRedisLock } from './redis-lock'
import {
  getActiveRedditSession,
  markRedditConnectionHealthy,
  markRedditConnectionReauthRequired,
  recordRedditConnectionFailure,
  updateRedditConnectionAccountProfile,
} from './reddit-session'
import { closeTransientRedditCircuitAfterCanary } from './reddit-service-safety'

const CANARY_RUN_LOCK_KEY = 'lock:reddit-delivery-canary:v2'
const CREDIT_DUE_KEY = 'schedule:reddit-delivery-credit-check:v2'
const CREDIT_INTERVAL_SECONDS = 15 * 60
const ACCOUNT_RECHECK_INTERVAL_MS = 6 * 60 * 60_000
const RUN_LOCK_TTL_MS = 6 * 60_000

export type RedditDeliveryCanaryResult = {
  status: 'ok' | 'failed' | 'skipped'
  code?: string
  checkedUser?: boolean
  checkedUsers?: number
  failedUsers?: number
}

type CanaryAccount = {
  user_id: string
  last_verified_at: string | null
  last_used_at: string | null
}

function lowCreditPercent(): number {
  const value = Number(process.env.HYPERBROWSER_CREDIT_ALERT_PERCENT)
  return Number.isSafeInteger(value) && value >= 1 && value <= 100 ? value : 20
}

export function getRedditCanaryBatchSize(
  raw = process.env.HYPERBROWSER_REDDIT_CANARY_BATCH_SIZE,
): number {
  const planCapacity = getHyperbrowserRedditMaxConcurrency()
  const configured = Number(raw)
  const desired = Number.isSafeInteger(configured) && configured >= 1 && configured <= 10
    ? configured
    : Math.min(planCapacity, 5)
  return Math.max(1, Math.min(desired, planCapacity, 10))
}

async function loadStaleAccounts(now = new Date()): Promise<CanaryAccount[]> {
  const cutoff = new Date(now.getTime() - ACCOUNT_RECHECK_INTERVAL_MS).toISOString()
  const { data, error } = await getServiceRoleClient()
    .from('reddit_connection_secrets')
    .select('user_id, last_verified_at, last_used_at')
    .eq('provider', 'hyperbrowser')
    .eq('status', 'active')
    .or(`last_verified_at.is.null,last_verified_at.lt.${cutoff}`)
    .order('last_verified_at', { ascending: true, nullsFirst: true })
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(getRedditCanaryBatchSize())
  if (error) throw error
  return (data ?? []) as CanaryAccount[]
}

async function checkCreditsIfDue(userId?: string): Promise<boolean> {
  const lease = await redis.set(CREDIT_DUE_KEY, 'running', 'EX', 5 * 60, 'NX')
  if (lease !== 'OK') return false
  try {
    const credits = await fetchHyperbrowserCreditInfo()
    const percentRemaining = credits.limit > 0 ? (credits.remaining / credits.limit) * 100 : 0
    if (percentRemaining <= lowCreditPercent()) {
      await sendRedditDeliveryAlert({
        kind: 'credits_low',
        code: 'hyperbrowser_credits_low',
        ...(userId ? { userId } : {}),
        detail: `${credits.remaining} of ${credits.limit} credits remain.`,
      })
    }
    await recordHyperbrowserHealth({
      status: 'ok',
      creditsRemaining: credits.remaining,
      creditsLimit: credits.limit,
    })
    await redis.set(CREDIT_DUE_KEY, 'verified', 'EX', CREDIT_INTERVAL_SECONDS)
    return true
  } catch (error) {
    await redis.del(CREDIT_DUE_KEY).catch(() => undefined)
    throw error
  }
}

async function checkAccount(userId: string): Promise<{ ok: boolean; code?: string }> {
  try {
    const session = await getActiveRedditSession(userId)
    if (session.provider !== 'hyperbrowser') {
      throw new HyperbrowserRedditError('reddit_reconnect_required', false, false, true)
    }
    const profile = await fetchHyperbrowserRedditAccountProfile({
      username: session.username,
      profileId: session.profileId,
    })
    await updateRedditConnectionAccountProfile(userId, {
      accountCreatedAt: profile.createdAt,
      linkKarma: profile.linkKarma,
      commentKarma: profile.commentKarma,
    })
    await markRedditConnectionHealthy(userId)
    return { ok: true }
  } catch (error) {
    const providerError = error instanceof HyperbrowserRedditError ? error : null
    const code = providerError?.code ?? 'hyperbrowser_canary_failed'
    if (code === 'hyperbrowser_session_busy') return { ok: false, code }
    if (providerError?.reauthRequired) {
      await markRedditConnectionReauthRequired(userId, code).catch(() => undefined)
    } else {
      await recordRedditConnectionFailure(userId, code).catch(() => undefined)
    }
    await sendRedditDeliveryAlert({
      kind: providerError?.reauthRequired ? 'reconnect_required' : 'canary_failed',
      code,
      userId,
    }).catch(() => undefined)
    logger.warn({ code, userId }, 'Reddit account canary failed')
    return { ok: false, code }
  }
}

async function runCanaryPass(): Promise<RedditDeliveryCanaryResult> {
  const accounts = await loadStaleAccounts()
  const creditsChecked = await checkCreditsIfDue(accounts[0]?.user_id)

  const results = await Promise.all(accounts.map(account => checkAccount(account.user_id)))
  const successful = results.filter(result => result.ok).length
  const failed = results.filter(result => !result.ok && result.code !== 'hyperbrowser_session_busy')
  const busy = results.filter(result => result.code === 'hyperbrowser_session_busy').length
  const providerFailure = failed.find(result => ![
    'reddit_reconnect_required',
    'reddit_account_identity_mismatch',
  ].includes(result.code ?? ''))

  if (!providerFailure && (successful > 0 || creditsChecked)) {
    await closeTransientRedditCircuitAfterCanary()
  }
  if (providerFailure) {
    const code = providerFailure.code ?? 'hyperbrowser_canary_failed'
    await recordHyperbrowserHealth({ status: 'error', code }).catch(() => undefined)
    return {
      status: 'failed',
      code,
      checkedUser: accounts.length > 0,
      checkedUsers: successful,
      failedUsers: failed.length,
    }
  }

  return {
    status: 'ok',
    checkedUser: accounts.length > 0,
    checkedUsers: successful,
    failedUsers: failed.length,
    ...(busy > 0 ? { code: 'hyperbrowser_session_busy' } : {}),
  }
}

export async function runRedditDeliveryCanary(): Promise<RedditDeliveryCanaryResult> {
  if (getRedditPostingProviderKind() !== 'hyperbrowser') {
    return { status: 'skipped', code: 'hyperbrowser_disabled' }
  }

  try {
    const result = await withRedisLock(
      redis,
      CANARY_RUN_LOCK_KEY,
      RUN_LOCK_TTL_MS,
      runCanaryPass,
      { waitMs: 0 },
    )
    return result ?? { status: 'skipped', code: 'already_running' }
  } catch (error) {
    const providerError = error instanceof HyperbrowserRedditError ? error : null
    const code = providerError?.code ?? 'hyperbrowser_canary_failed'
    await recordHyperbrowserHealth({ status: 'error', code }).catch(() => undefined)
    await sendRedditDeliveryAlert({
      kind: code === 'hyperbrowser_credits_exhausted' ? 'credits_low' : 'canary_failed',
      code,
    }).catch(() => undefined)
    logger.error({ code }, 'Reddit delivery canary failed')
    return { status: 'failed', code, checkedUser: false, checkedUsers: 0, failedUsers: 0 }
  }
}
