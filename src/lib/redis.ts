import Redis from 'ioredis'

// Create a singleton instance of Redis
const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379'

export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  // Queue producers and HTTP routes must fail promptly when Redis is down.
  // BullMQ workers use their own blocking connection with null retries.
  maxRetriesPerRequest: 1,
  connectTimeout: 5_000,
  family: 0,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
})
