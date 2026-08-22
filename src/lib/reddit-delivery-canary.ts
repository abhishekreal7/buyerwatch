import { getServiceRoleClient } from './admin'
import { getRedditPostingProviderKind } from './env'
import {
  fetchHyperbrowserCreditInfo,
  fetchHyperbrowserRedditAccountProfile,
  HyperbrowserRedditError,
} from './hyperbrowser-reddit'
import { logger } from './logger'
import { sendRedditDeliveryAlert } from './reddit-delivery-alerts'
import { recordHyperbrowserHealth } from './reddit-delivery-health'
import { redis } from './redis'
import {
  getActiveRedditSession,
  markRedditConnectionHealthy,
  markRedditConnectionReauthRequired,
  updateRedditConnectionAccountProfile,
} from './reddit-session'
import { closeTransientRedditCircuitAfterCanary } from './reddit-service-safety'

const CANARY_DUE_KEY = 'schedule:reddit-delivery-canary:v1'
const CANARY_CURSOR_KEY = 'cursor:reddit-delivery-canary:v1'
const SUCCESS_INTERVAL_SECONDS = 6 * 60 * 60
const FAILURE_RETRY_SECONDS = 15 * 60

export type RedditDeliveryCanaryResult = {
  status: 'ok' | 'failed' | 'skipped'
  code?: string
  checkedUser?: boolean
}

function lowCreditPercent(): number {
  const value = Number(process.env.HYPERBROWSER_CREDIT_ALERT_PERCENT)
  return Number.isSafeInteger(value) && value >= 1 && value <= 100 ? value : 20
}

async function nextActiveUserId(): Promise<string | null> {
  const admin = getServiceRoleClient()
  const cursor = await redis.get(CANARY_CURSOR_KEY).catch(() => null)
  const base = () => admin
    .from('reddit_connection_secrets')
    .select('user_id')
    .eq('provider', 'hyperbrowser')
    .eq('status', 'active')
    .order('user_id', { ascending: true })
    .limit(1)
  const first = cursor ? await base().gt('user_id', cursor) : await base()
  if (first.error) throw first.error
  let userId = first.data?.[0]?.user_id ?? null
  if (!userId && cursor) {
    const wrapped = await base()
    if (wrapped.error) throw wrapped.error
    userId = wrapped.data?.[0]?.user_id ?? null
  }
  if (userId) await redis.set(CANARY_CURSOR_KEY, userId, 'EX', 30 * 24 * 60 * 60)
  return userId
}

export async function runRedditDeliveryCanary(): Promise<RedditDeliveryCanaryResult> {
  if (getRedditPostingProviderKind() !== 'hyperbrowser') {
    return { status: 'skipped', code: 'hyperbrowser_disabled' }
  }
  const lease = await redis.set(CANARY_DUE_KEY, 'running', 'EX', 10 * 60, 'NX')
  if (lease !== 'OK') return { status: 'skipped', code: 'not_due' }

  let userId: string | null = null
  try {
    userId = await nextActiveUserId()
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

    if (userId) {
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
    }

    await recordHyperbrowserHealth({
      status: 'ok',
      creditsRemaining: credits.remaining,
      creditsLimit: credits.limit,
    })
    await closeTransientRedditCircuitAfterCanary()
    await redis.set(CANARY_DUE_KEY, 'verified', 'EX', SUCCESS_INTERVAL_SECONDS)
    return { status: 'ok', checkedUser: Boolean(userId) }
  } catch (error) {
    const providerError = error instanceof HyperbrowserRedditError ? error : null
    const code = providerError?.code ?? 'hyperbrowser_canary_failed'
    if (code === 'hyperbrowser_session_busy') {
      await redis.set(CANARY_DUE_KEY, 'busy', 'EX', 5 * 60)
      return { status: 'skipped', code }
    }
    await recordHyperbrowserHealth({ status: 'error', code }).catch(() => undefined)
    if (userId && providerError?.reauthRequired) {
      await markRedditConnectionReauthRequired(userId, code).catch(() => undefined)
    }
    await sendRedditDeliveryAlert({
      kind: code === 'hyperbrowser_credits_exhausted'
        ? 'credits_low'
        : providerError?.reauthRequired
          ? 'reconnect_required'
          : 'canary_failed',
      code,
      ...(userId ? { userId } : {}),
    }).catch(() => undefined)
    await redis.set(CANARY_DUE_KEY, 'failed', 'EX', FAILURE_RETRY_SECONDS).catch(() => undefined)
    logger.error({ error, code }, 'Reddit delivery canary failed')
    return { status: 'failed', code, checkedUser: Boolean(userId) }
  }
}
