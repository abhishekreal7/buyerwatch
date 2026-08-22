import { Client, Receiver } from '@upstash/qstash'
import { getAppUrl } from './app-url'
import { redis } from './redis'

const MONITORING_SCHEDULE_ID = 'buyerwatch-reddit-monitor'
const MONITORING_SCHEDULE_CHECK_KEY = 'maintenance:qstash-monitor-schedule:v1'
const MONITORING_SCHEDULE_CHECK_TTL_SECONDS = 24 * 60 * 60

export function hasQStashConfiguration(): boolean {
  return Boolean(
    process.env.QSTASH_TOKEN?.trim()
    && process.env.QSTASH_CURRENT_SIGNING_KEY?.trim()
    && process.env.QSTASH_NEXT_SIGNING_KEY?.trim(),
  )
}

export async function verifyQStashRequest(
  request: Request,
  body: string,
): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim()
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim()
  const signature = request.headers.get('upstash-signature')
  if (!currentSigningKey || !nextSigningKey || !signature) return false

  const receiver = new Receiver({ currentSigningKey, nextSigningKey })
  try {
    return await receiver.verify({
      signature,
      body,
      url: request.url,
      upstashRegion: request.headers.get('upstash-region') ?? undefined,
    })
  } catch {
    return false
  }
}

export async function publishQStashJson<T>(
  path: string,
  body: T,
  options: {
    retries?: number
    timeout?: number | `${bigint}s` | `${bigint}m` | `${bigint}h` | `${bigint}d`
  } = {},
): Promise<string | null> {
  const token = process.env.QSTASH_TOKEN?.trim()
  if (!token) return null

  const result = await new Client({ token }).publishJSON({
    url: `${getAppUrl()}${path.startsWith('/') ? path : `/${path}`}`,
    body,
    retries: options.retries ?? 2,
    timeout: options.timeout ?? '4m',
  })
  return 'messageId' in result ? result.messageId : null
}

export async function cancelQStashMessage(messageId: string): Promise<number> {
  const token = process.env.QSTASH_TOKEN?.trim()
  if (!token) throw new Error('QStash is not configured')
  const result = await new Client({ token }).messages.cancel(messageId)
  return result.cancelled
}

export function publishMonitoringRun(
  forceUserId?: string,
  forceTarget?: string,
  forcePlatform?: 'reddit' | 'bluesky',
): Promise<string | null> {
  return publishQStashJson(
    '/api/cron/enqueue',
    forceUserId
      ? {
          forceUserId,
          ...(forceTarget ? { forceTarget } : {}),
          ...(forcePlatform ? { forcePlatform } : {}),
        }
      : {},
  )
}

/**
 * Idempotently repair the production monitoring schedule from inside the
 * signed cron path. Sensitive QStash tokens cannot be pulled back out of
 * Vercel, so this lets the trusted runtime verify its own schedule without an
 * operator copying the token to a laptop.
 */
export async function ensureMonitoringSchedule(): Promise<'updated' | 'recently_verified' | 'disabled'> {
  const token = process.env.QSTASH_TOKEN?.trim()
  if (!token) return 'disabled'

  const lease = await redis.set(
    MONITORING_SCHEDULE_CHECK_KEY,
    'checking',
    'EX',
    5 * 60,
    'NX',
  )
  if (lease !== 'OK') return 'recently_verified'

  const appUrl = getAppUrl()
  const destination = `${appUrl}/api/cron/enqueue`
  const failureCallback = `${appUrl}/api/cron/failure`
  const client = new Client({ token })
  try {
    await client.schedules.create({
      destination,
      scheduleId: MONITORING_SCHEDULE_ID,
      cron: '*/5 * * * *',
      method: 'POST',
      retries: 2,
      timeout: '4m',
      failureCallback,
      label: MONITORING_SCHEDULE_ID,
    })
    const schedule = await client.schedules.get(MONITORING_SCHEDULE_ID)
    if (
      schedule.destination !== destination
      || schedule.cron !== '*/5 * * * *'
      || schedule.failureCallback !== failureCallback
      || schedule.isPaused
    ) {
      throw new Error('QStash monitoring schedule verification failed')
    }
    await redis.set(
      MONITORING_SCHEDULE_CHECK_KEY,
      'verified',
      'EX',
      MONITORING_SCHEDULE_CHECK_TTL_SECONDS,
    )
    return 'updated'
  } catch (error) {
    await redis.del(MONITORING_SCHEDULE_CHECK_KEY).catch(() => undefined)
    throw error
  }
}
