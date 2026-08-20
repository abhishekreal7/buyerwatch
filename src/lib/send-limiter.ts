import { randomUUID } from 'node:crypto'
import { redis } from './redis'
import { logger } from './logger'

const POST_LIMITS = {
  reddit: { maxPerHour: 3, minGapSeconds: 300 },
  bluesky: { maxPerHour: 10, minGapSeconds: 60 },
} as const

type SupportedPlatform = keyof typeof POST_LIMITS

export type SendReservation =
  | { allowed: true; token: string }
  | { allowed: false; reason: string; reset: number }

export async function reserveSendSlot(
  userId: string,
  platform: SupportedPlatform,
  options: {
    maxPerDay?: number
    minimumGapSeconds?: number
    community?: string
    communityGapSeconds?: number
  } = {},
): Promise<SendReservation> {
  const { maxPerHour, minGapSeconds: defaultMinGapSeconds } = POST_LIMITS[platform]
  const minGapSeconds = Math.max(
    defaultMinGapSeconds,
    Math.min(24 * 60 * 60, options.minimumGapSeconds ?? defaultMinGapSeconds),
  )
  const maxPerDay = Math.max(1, Math.min(100, options.maxPerDay ?? 100))
  const normalizedCommunity = options.community?.trim().toLocaleLowerCase().replace(/[^a-z0-9_.-]/g, '') ?? ''
  const communityGapSeconds = normalizedCommunity
    ? Math.max(0, Math.min(7 * 24 * 60 * 60, options.communityGapSeconds ?? 0))
    : 0
  const now = Date.now()
  const currentHour = Math.floor(now / 3_600_000)
  const currentDay = new Date(now).toISOString().slice(0, 10)
  const countKey = `post-count:${userId}:${platform}:${currentHour}`
  const dailyCountKey = `post-count:${userId}:${platform}:${currentDay}`
  const gapKey = `last-post:${userId}:${platform}`
  const communityGapKey = `last-post-community:${userId}:${platform}:${normalizedCommunity || 'none'}`
  const reservationKey = `post-reservation:${userId}:${platform}`
  const token = randomUUID()

  const script = `
    local count = tonumber(redis.call('GET', KEYS[1]) or '0')
    if count >= tonumber(ARGV[1]) then return {0, 1} end
    local daily = tonumber(redis.call('GET', KEYS[2]) or '0')
    if daily >= tonumber(ARGV[2]) then return {0, 4} end
    local last = tonumber(redis.call('GET', KEYS[3]) or '0')
    if last > 0 and (tonumber(ARGV[3]) - last) < tonumber(ARGV[4]) then return {0, 2, last} end
    local communityLast = tonumber(redis.call('GET', KEYS[4]) or '0')
    if tonumber(ARGV[7]) > 0 and communityLast > 0 and (tonumber(ARGV[3]) - communityLast) < tonumber(ARGV[7]) then return {0, 5, communityLast} end
    if not redis.call('SET', KEYS[5], ARGV[5], 'NX', 'PX', ARGV[6]) then return {0, 3} end
    return {1}
  `

  try {
    const result = await redis.eval(
      script,
      5,
      countKey,
      dailyCountKey,
      gapKey,
      communityGapKey,
      reservationKey,
      maxPerHour,
      maxPerDay,
      now,
      minGapSeconds * 1_000,
      token,
      10 * 60_000,
      communityGapSeconds * 1_000,
    ) as number[]

    if (result[0] === 1) return { allowed: true, token }
    if (result[1] === 1) {
      const reset = (currentHour + 1) * 3_600_000
      return { allowed: false, reason: 'hourly_limit', reset }
    }
    if (result[1] === 2) {
      return {
        allowed: false,
        reason: 'minimum_gap',
        reset: Number(result[2]) + minGapSeconds * 1_000,
      }
    }
    if (result[1] === 4) {
      const reset = Date.parse(`${new Date(now + 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`)
      return { allowed: false, reason: 'daily_limit', reset }
    }
    if (result[1] === 5) {
      return {
        allowed: false,
        reason: 'community_cooldown',
        reset: Number(result[2]) + communityGapSeconds * 1_000,
      }
    }
    return { allowed: false, reason: 'send_in_progress', reset: now + 60_000 }
  } catch (error) {
    logger.error({ error }, 'Unable to reserve a send rate-limit slot')
    return { allowed: false, reason: 'rate_limiter_unavailable', reset: now + 60_000 }
  }
}

export async function recordSuccessfulSend(
  userId: string,
  platform: SupportedPlatform,
  token: string,
  options: { community?: string } = {},
): Promise<void> {
  const now = Date.now()
  const currentHour = Math.floor(now / 3_600_000)
  const currentDay = new Date(now).toISOString().slice(0, 10)
  const countKey = `post-count:${userId}:${platform}:${currentHour}`
  const dailyCountKey = `post-count:${userId}:${platform}:${currentDay}`
  const gapKey = `last-post:${userId}:${platform}`
  const normalizedCommunity = options.community?.trim().toLocaleLowerCase().replace(/[^a-z0-9_.-]/g, '') ?? ''
  const communityGapKey = `last-post-community:${userId}:${platform}:${normalizedCommunity || 'none'}`
  const reservationKey = `post-reservation:${userId}:${platform}`
  const script = `
    if redis.call('GET', KEYS[5]) ~= ARGV[1] then return 0 end
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], 3700) end
    local daily = redis.call('INCR', KEYS[2])
    if daily == 1 then redis.call('EXPIRE', KEYS[2], 90000) end
    redis.call('SET', KEYS[3], ARGV[2], 'EX', 3700)
    if ARGV[3] == '1' then redis.call('SET', KEYS[4], ARGV[2], 'EX', 604800) end
    redis.call('DEL', KEYS[5])
    return 1
  `
  const recorded = await redis.eval(
    script,
    5,
    countKey,
    dailyCountKey,
    gapKey,
    communityGapKey,
    reservationKey,
    token,
    now,
    normalizedCommunity ? '1' : '0',
  )
  if (recorded !== 1) throw new Error('Send reservation expired before success was recorded')
}

export async function releaseSendSlot(
  userId: string,
  platform: SupportedPlatform,
  token: string,
): Promise<void> {
  const reservationKey = `post-reservation:${userId}:${platform}`
  await redis.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
    1,
    reservationKey,
    token,
  )
}

/** Readiness probe retained for operational scripts; it never consumes quota. */
export async function checkSendRateLimit(
  userId: string,
  platform: SupportedPlatform,
): Promise<{ allowed: boolean; reason?: string; reset?: number }> {
  const reservation = await reserveSendSlot(userId, platform)
  if (!reservation.allowed) return reservation
  await releaseSendSlot(userId, platform, reservation.token)
  return { allowed: true }
}
