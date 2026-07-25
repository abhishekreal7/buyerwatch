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

export const authRateLimit: Limiter = redisAdapter
  ? new Ratelimit({
      redis: redisAdapter as never,
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      analytics: false,
    })
  : new MemoryLimiter(5, 15 * 60_000)

export const actionRateLimit: Limiter = redisAdapter
  ? new Ratelimit({
      redis: redisAdapter as never,
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      analytics: false,
    })
  : new MemoryLimiter(10, 60_000)

export async function getIp() {
  const headersList = await headers()
  const forwardedFor = headersList.get('x-forwarded-for')
  const realIp = headersList.get('x-real-ip')
  return forwardedFor?.split(',')[0]?.trim() || realIp?.trim() || 'unknown'
}
