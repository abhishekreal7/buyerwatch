import Redis from 'ioredis'

// Create a singleton instance of Redis
const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379'

export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  family: 0,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
})
