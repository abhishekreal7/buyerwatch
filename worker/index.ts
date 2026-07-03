import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { redditFetchHandler } from './handlers/fetch-reddit'
import { blueskyFetchHandler } from './handlers/fetch-bluesky'
import { scorePostHandler } from './handlers/score-post'
import * as dotenv from 'dotenv'
import path from 'path'

// Load environment variables for the standalone worker
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379'
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null })

redis.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err.message)
  process.exit(1)
})

redis.on('ready', () => {
  console.log('✅ Connected to Redis successfully.')
})

console.log('Starting Scouto workers...')

const fetchRedditWorker = new Worker('fetch-reddit', redditFetchHandler, {
  connection: redis as any,
  limiter: { 
    max: 1, 
    duration: 1100 
  }, // Reddit OAuth: stay under 60 req/min globally
})
fetchRedditWorker.on('ready', () => console.log('🎧 fetch-reddit worker is listening...'))

const fetchBlueskyWorker = new Worker('fetch-bluesky', blueskyFetchHandler, {
  connection: redis as any,
  limiter: { 
    max: 3, 
    duration: 1000 
  }, // Bluesky API limits are more generous
})
fetchBlueskyWorker.on('ready', () => console.log('🎧 fetch-bluesky worker is listening...'))

const scorePostWorker = new Worker('score-post', scorePostHandler, {
  connection: redis as any,
  concurrency: 10, // AI processing can be heavily parallelized
})
scorePostWorker.on('ready', () => console.log('🎧 score-post worker is listening...'))

console.log('Workers initialized. Waiting for connections...')
