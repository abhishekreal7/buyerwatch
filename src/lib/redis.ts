import Redis from 'ioredis'

// Create a singleton instance of Redis
const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379'

function createRedisInstance() {
  try {
    return new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      family: 0,
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    })
  } catch (err) {
    console.warn('[redis] Failed to initialize Redis with configured URL, falling back to localhost lazy client:', err)
    return new Redis('redis://127.0.0.1:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      family: 0,
    })
  }
}

export const redis = createRedisInstance()
