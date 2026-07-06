import { Worker } from 'bullmq'
import Redis from 'ioredis'
import express from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { redditFetchHandler } from './handlers/fetch-reddit'
import { blueskyFetchHandler } from './handlers/fetch-bluesky'
import { xFetchHandler } from './handlers/fetch-x'
import { scorePostHandler } from './handlers/score-post'
import { sendDigestHandler } from './handlers/send-digest'
import { sendReplyHandler } from './handlers/send-reply'
import { redditFetchQueue, blueskyFetchQueue, xFetchQueue, scorePostQueue, sendDigestQueue, sendReplyQueue } from '../src/lib/queues'
import { logger } from '../src/lib/logger'
import * as dotenv from 'dotenv'
import path from 'path'
import * as Sentry from '@sentry/node'

// Load environment variables for the standalone worker
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
})

const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379'
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  family: 0,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
})

redis.on('error', (err) => {
  logger.error({ err }, '❌ Redis Connection Error')
  process.exit(1)
})

redis.on('ready', () => {
  logger.info('✅ Connected to Redis successfully.')
})

logger.info('Starting Scouto workers...')

const fetchRedditWorker = new Worker('fetch-reddit', redditFetchHandler, {
  connection: redis as any,
  limiter: { 
    max: 1, 
    duration: 1100 
  }, // Reddit OAuth: stay under 60 req/min globally
})
fetchRedditWorker.on('ready', () => logger.info('🎧 fetch-reddit worker is listening...'))

const fetchBlueskyWorker = new Worker('fetch-bluesky', blueskyFetchHandler, {
  connection: redis as any,
  limiter: { 
    max: 3, 
    duration: 1000 
  }, // Bluesky API limits are more generous
})
fetchBlueskyWorker.on('ready', () => logger.info('🎧 fetch-bluesky worker is listening...'))

const fetchXWorker = new Worker('fetch-x', xFetchHandler, {
  connection: redis as any,
  limiter: {
    max: 180, 
    duration: 900000
  }
})
fetchXWorker.on('ready', () => logger.info('🎧 fetch-x worker is listening...'))

const scorePostWorker = new Worker('score-post', scorePostHandler, {
  connection: redis as any,
  concurrency: 10, // AI processing can be heavily parallelized
})
scorePostWorker.on('ready', () => logger.info('🎧 score-post worker is listening...'))

logger.info('Workers initialized. Waiting for connections...')

const captureJobError = (job: any, err: Error) => {
  Sentry.captureException(err, {
    tags: {
      jobId: job?.id,
      jobName: job?.name,
      queueName: job?.queueName,
      target: job?.data?.target,
      userId: job?.data?.userId,
      platform: job?.data?.platform
    },
    extra: { data: job?.data }
  })
}

fetchRedditWorker.on('failed', captureJobError)
fetchBlueskyWorker.on('failed', captureJobError)
fetchXWorker.on('failed', captureJobError)
scorePostWorker.on('failed', captureJobError)

const sendReplyWorker = new Worker('send-reply', sendReplyHandler, {
  connection: redis as any,
  concurrency: 5,
})
sendReplyWorker.on('ready', () => logger.info('🎧 send-reply worker is listening...'))
sendReplyWorker.on('failed', captureJobError)

const sendDigestWorker = new Worker('send-digest', sendDigestHandler, {
  connection: redis as any,
  concurrency: 5,
})
sendDigestWorker.on('ready', () => logger.info('🎧 send-digest worker is listening...'))
sendDigestWorker.on('failed', captureJobError)

// Worker Heartbeat (Healthchecks.io or similar)
if (process.env.WORKER_HEALTHCHECK_URL) {
  setInterval(() => {
    fetch(process.env.WORKER_HEALTHCHECK_URL!)
      .catch(e => logger.error({ e }, 'Worker heartbeat failed'))
  }, 60 * 1000) // Ping every minute
}

// Setup Bull Board
const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: [
    new BullMQAdapter(redditFetchQueue),
    new BullMQAdapter(blueskyFetchQueue),
    new BullMQAdapter(xFetchQueue),
    new BullMQAdapter(scorePostQueue),
    new BullMQAdapter(sendDigestQueue),
    new BullMQAdapter(sendReplyQueue),
  ],
  serverAdapter,
})

const app = express()

// Basic auth for Bull Board based on ADMIN_EMAILS or a simple secret
const adminSecret = process.env.ADMIN_SECRET || 'scouto_admin'
app.use('/admin/queues', (req, res, next) => {
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${adminSecret}`) {
    // In production, you might want to use real Basic Auth or a session cookie
    // For a standalone worker on a non-public port, this acts as a first line of defense
    return res.status(401).send('Unauthorized')
  }
  next()
}, serverAdapter.getRouter())

const port = process.env.WORKER_PORT || 3001
app.listen(port, () => {
  logger.info(`bull-board running on http://localhost:${port}/admin/queues`)
})
