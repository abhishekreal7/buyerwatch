import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in env
// Since we only have UPSTASH_REDIS_URL right now, we can use ioredis with upstash ratelimit or we need upstash redis rest tokens.
// But upstash/ratelimit actually supports standard Redis clients via adapter, or we can just use upstash/redis if rest url is provided.
// Let's create an ioredis adapter for @upstash/ratelimit
import IORedis from 'ioredis'

let redisClient: IORedis | null = null
if (process.env.UPSTASH_REDIS_URL) {
  redisClient = new IORedis(process.env.UPSTASH_REDIS_URL)
}

// Minimal adapter for Upstash Ratelimit using ioredis
const redisAdapter = redisClient ? {
  sadd: async (key: string, ...members: string[]) => redisClient!.sadd(key, ...members),
  eval: async (script: string, keys: string[], args: string[]) => {
    // ioredis eval takes: script, numKeys, ...keys, ...args
    return redisClient!.eval(script, keys.length, ...keys, ...args)
  }
} : null

export const authRateLimit = redisAdapter ? new Ratelimit({
  redis: redisAdapter as any,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  analytics: false,
}) : null

export const actionRateLimit = redisAdapter ? new Ratelimit({
  redis: redisAdapter as any,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: false,
}) : null

export async function getIp() {
  const headersList = await headers()
  const forwardedFor = headersList.get('x-forwarded-for')
  const realIp = headersList.get('x-real-ip')

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  if (realIp) {
    return realIp.trim()
  }

  return '127.0.0.1'
}
