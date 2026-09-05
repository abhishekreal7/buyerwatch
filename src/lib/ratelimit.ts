import { Ratelimit } from '@upstash/ratelimit'
import { headers } from 'next/headers'
import IORedis from 'ioredis'

type LimitResult = { success: boolean }
type Limiter = { limit(key: string): Promise<LimitResult> }

class MemoryLimiter implements Limiter {
  private readonly entries = new Map<string, number[]>()
  private requestsSinceCleanup = 0

  constructor(
    private readonly maximum: number,
    private readonly windowMs: number,
  ) {}

  async limit(key: string): Promise<LimitResult> {
    const now = Date.now()
    this.requestsSinceCleanup += 1
    if (this.requestsSinceCleanup >= 100) {
      for (const [entryKey, timestamps] of this.entries) {
        if (!timestamps.some(timestamp => now - timestamp < this.windowMs)) {
          this.entries.delete(entryKey)
        }
      }
      this.requestsSinceCleanup = 0
    }
    const recent = (this.entries.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs)
    if (recent.length >= this.maximum) return { success: false }
    recent.push(now)
    this.entries.set(key, recent)
    return { success: true }
  }
}

class UnavailableLimiter implements Limiter {
  async limit(): Promise<LimitResult> {
    return { success: false }
  }
}

let redisClient: IORedis | null = null
if (process.env.UPSTASH_REDIS_URL) {
  try {
    redisClient = new IORedis(process.env.UPSTASH_REDIS_URL, {
      lazyConnect: true,
      tls: process.env.UPSTASH_REDIS_URL.startsWith('rediss://') ? {} : undefined,
    })
  } catch (err) {
    console.warn('[ratelimit] Could not parse UPSTASH_REDIS_URL, using fallback limiter:', err)
  }
}

const redisAdapter = redisClient
  ? {
      sadd: async (key: string, ...members: string[]) => redisClient.sadd(key, ...members),
      eval: async (script: string, keys: string[], args: string[]) =>
        redisClient.eval(script, keys.length, ...keys, ...args),
      evalsha: async (sha: string, keys: string[], args: string[]) =>
        redisClient.evalsha(sha, keys.length, ...keys, ...args),
    }
  : null

function createLimiter(
  maximum: number,
  window: `${number} ${'s' | 'm' | 'h'}`,
  windowMs: number,
  options: { sensitive?: boolean } = {},
): Limiter {
  if (redisAdapter) {
    return new Ratelimit({
        redis: redisAdapter as never,
        limiter: Ratelimit.slidingWindow(maximum, window),
        analytics: false,
      })
  }
  if (options.sensitive && process.env.NODE_ENV === 'production') {
    return new UnavailableLimiter()
  }
  return new MemoryLimiter(maximum, windowMs)
}

export const authRateLimit = createLimiter(5, '15 m', 15 * 60_000, { sensitive: true })
export const actionRateLimit = createLimiter(10, '1 m', 60_000, { sensitive: true })
export const aiRateLimit = createLimiter(8, '1 h', 60 * 60_000, { sensitive: true })
export const fetchNowRateLimit = createLimiter(4, '1 h', 60 * 60_000, { sensitive: true })
export const searchRateLimit = createLimiter(60, '1 m', 60_000)
export const communityPolicyRateLimit = createLimiter(30, '1 m', 60_000)
export const webhookRateLimit = createLimiter(30, '1 m', 60_000, { sensitive: true })
export const settingsRateLimit = createLimiter(20, '1 h', 60 * 60_000, { sensitive: true })

export async function getIp() {
  const headersList = await headers()
  const forwardedFor = headersList.get('x-forwarded-for')
  const realIp = headersList.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp?.trim() || 'unknown'
}
