import { Ratelimit } from '@upstash/ratelimit'
import { headers } from 'next/headers'
import IORedis from 'ioredis'

type LimitResult = { success: boolean }
type Limiter = { limit(key: string): Promise<LimitResult> }

class MemoryLimiter implements Limiter {
  private readonly entries = new Map<string, number[]>()

  constructor(
    private readonly maximum: number,
    private readonly windowMs: number,
  ) {}

  async limit(key: string): Promise<LimitResult> {
    const now = Date.now()
    const recent = (this.entries.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs)
    if (recent.length >= this.maximum) return { success: false }
    recent.push(now)
    this.entries.set(key, recent)
    return { success: true }
  }
}

const redisClient = process.env.UPSTASH_REDIS_URL
  ? new IORedis(process.env.UPSTASH_REDIS_URL, {
      lazyConnect: true,
      tls: process.env.UPSTASH_REDIS_URL.startsWith('rediss://') ? {} : undefined,
    })
  : null

const redisAdapter = redisClient
  ? {
      sadd: async (key: string, ...members: string[]) => redisClient.sadd(key, ...members),
      eval: async (script: string, keys: string[], args: string[]) =>
        redisClient.eval(script, keys.length, ...keys, ...args),
      evalsha: async (sha: string, keys: string[], args: string[]) =>
        redisClient.evalsha(sha, keys.length, ...keys, ...args),
    }
  : null

function createLimiter(maximum: number, window: `${number} ${'s' | 'm' | 'h'}`, windowMs: number): Limiter {
  return redisAdapter
    ? new Ratelimit({
        redis: redisAdapter as never,
        limiter: Ratelimit.slidingWindow(maximum, window),
        analytics: false,
      })
    : new MemoryLimiter(maximum, windowMs)
}

export const authRateLimit = createLimiter(5, '15 m', 15 * 60_000)
export const actionRateLimit = createLimiter(10, '1 m', 60_000)
export const aiRateLimit = createLimiter(8, '1 h', 60 * 60_000)
export const fetchNowRateLimit = createLimiter(4, '1 h', 60 * 60_000)
export const webhookRateLimit = createLimiter(30, '1 m', 60_000)
export const settingsRateLimit = createLimiter(20, '1 h', 60 * 60_000)

export async function getIp() {
  const headersList = await headers()
  const forwardedFor = headersList.get('x-forwarded-for')
  const realIp = headersList.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp?.trim() || 'unknown'
}
