import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import * as Sentry from '@sentry/node'
import { type Job, Queue, Worker, type WorkerOptions } from 'bullmq'
import express from 'express'
import { timingSafeEqual } from 'node:crypto'
import type { Server } from 'node:http'
import Redis from 'ioredis'
import { fetchWithTimeout, withTimeout } from '../src/lib/http'
import { logger } from '../src/lib/logger'
import {
  MONITORING_RUN_LOCK_KEY,
  MONITORING_RUN_LOCK_TTL_MS,
} from '../src/lib/monitoring-lock'
import {
  blueskyFetchQueue,
  checkGoogleRankQueue,
  deadLetterQueue,
  notifySlackQueue,
  redditFetchQueue,
  scorePostQueue,
  sendDigestQueue,
  sendReplyQueue,
  xFetchQueue,
} from '../src/lib/queues'
import { redis as queueRedis } from '../src/lib/redis'
import { blueskyFetchHandler } from './handlers/fetch-bluesky'
import { checkGoogleRankHandler } from './handlers/check-google-rank'
import { redditFetchHandler } from './handlers/fetch-reddit'
import { scorePostHandler } from './handlers/score-post'
import { sendDigestHandler } from './handlers/send-digest'
import { sendReplyHandler } from './handlers/send-reply'
import { notifySlackHandler } from './handlers/notify-slack'
import { xFetchHandler } from './handlers/fetch-x'
import {
  cleanupOperationalData,
  dispatchPendingOutbox,
  reconcileBillingSubscriptions,
  recoverStaleSends,
  withRedisLock,
} from '../src/lib/backend-maintenance'
import {
  enqueueDueMonitoring,
  enqueueWeeklyDigests,
} from '../src/lib/scheduler-jobs'
import { dispatchPendingFollowUps } from '../src/lib/follow-up-outbox'

type WorkerMetric = {
  completed: number
  failed: number
}

const queueEntries: Array<[string, Queue]> = [
  ['fetch-reddit', redditFetchQueue],
  ['fetch-bluesky', blueskyFetchQueue],
  ['fetch-x', xFetchQueue],
  ['score-post', scorePostQueue],
  ['send-digest', sendDigestQueue],
  ['send-reply', sendReplyQueue],
  ['notify-slack', notifySlackQueue],
  ['check-google-rank', checkGoogleRankQueue],
  ['dead-letter', deadLetterQueue],
]

function sanitizeMetricLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function safeBearerMatch(value: string | undefined, expected: string): boolean {
  const actualBuffer = Buffer.from(value ?? '')
  const expectedBuffer = Buffer.from(`Bearer ${expected}`)
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer)
}

function utcWeekKey(date: Date): string {
  const value = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ))
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function startWorkerRuntime() {
  const release = process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.user
      if (event.request) {
        delete event.request.cookies
        delete event.request.data
        delete event.request.headers
        delete event.request.query_string
      }
      return event
    },
  })

  const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379'
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    family: 0,
    tls: redisUrl.startsWith('rediss://') ? {} : undefined,
  })

  let redisReady = false
  let shuttingDown = false
  let lastSchedulerSuccess = 0
  const schedulerStartedAt = Date.now()
  const readyWorkers = new Set<string>()
  const metrics = new Map<string, WorkerMetric>()

  redis.on('error', (error) => {
    redisReady = false
    logger.error({ error }, 'Redis connection error')
  })
  redis.on('ready', () => {
    redisReady = true
    logger.info('Redis connection ready')
  })

  const workers: Worker[] = []

  const captureJobError = async (job: Job | undefined, error: Error) => {
    Sentry.captureException(error, {
      tags: {
        jobName: job?.name,
        queueName: job?.queueName,
        platform: typeof job?.data?.platform === 'string' ? job.data.platform : undefined,
      },
      extra: {
        attemptsMade: job?.attemptsMade,
        configuredAttempts: job?.opts?.attempts,
      },
    })

    const attempts = typeof job?.opts?.attempts === 'number' ? job.opts.attempts : 1
    if (job && job.attemptsMade >= attempts) {
      await deadLetterQueue.add('failed-job', {
        queueName: job.queueName,
        jobId: job.id,
        jobName: job.name,
        payload: job.data,
        options: {
          attempts: job.opts.attempts,
          backoff: job.opts.backoff,
        },
        failedAt: new Date().toISOString(),
        error: error.message.slice(0, 500),
      })
    }
  }

  const createWorker = (
    name: string,
    handler: (job: Job<any>) => Promise<any>,
    options: Omit<WorkerOptions, 'connection'> = {},
  ) => {
    metrics.set(name, { completed: 0, failed: 0 })
    const worker = new Worker(name, handler, {
      ...options,
      connection: redis as never,
    })
    workers.push(worker)
    worker.on('ready', () => {
      readyWorkers.add(name)
      logger.info({ queue: name }, 'Worker ready')
    })
    worker.on('closed', () => readyWorkers.delete(name))
    worker.on('error', (error) => {
      readyWorkers.delete(name)
      logger.error({ error, queue: name }, 'Worker error')
    })
    worker.on('completed', () => {
      const metric = metrics.get(name)
      if (metric) metric.completed += 1
    })
    worker.on('failed', async (job, error) => {
      const metric = metrics.get(name)
      if (metric) metric.failed += 1
      await captureJobError(job, error)
    })
    return worker
  }

  createWorker('fetch-reddit', redditFetchHandler, {
    limiter: { max: 1, duration: 1_100 },
  })
  createWorker('fetch-bluesky', blueskyFetchHandler, {
    limiter: { max: 3, duration: 1_000 },
  })
  createWorker('fetch-x', xFetchHandler, {
    limiter: { max: 180, duration: 900_000 },
  })
  createWorker('score-post', scorePostHandler, { concurrency: 10 })
  createWorker('send-reply', sendReplyHandler, { concurrency: 5 })
  createWorker('send-digest', sendDigestHandler, { concurrency: 5 })
  createWorker('notify-slack', notifySlackHandler, { concurrency: 10 })
  createWorker('check-google-rank', checkGoogleRankHandler, {
    concurrency: 5,
    limiter: { max: 10, duration: 1_000 },
  })

  const runScheduledWork = async () => {
    const now = new Date()
    const minute = Math.floor(now.getTime() / 60_000)
    try {
      await withRedisLock(
        redis,
        MONITORING_RUN_LOCK_KEY,
        MONITORING_RUN_LOCK_TTL_MS,
        () => enqueueDueMonitoring(now),
      )
      await withRedisLock(
        redis,
        `scheduler:outbox:${minute}`,
        55_000,
        async () => {
          await dispatchPendingOutbox()
          await dispatchPendingFollowUps()
        },
      )

      if (minute % 5 === 0) {
        await withRedisLock(
          redis,
          `scheduler:send-recovery:${Math.floor(minute / 5)}`,
          4 * 60_000,
          () => recoverStaleSends(now),
        )
      }

      if (minute % 360 === 0) {
        await withRedisLock(
          redis,
          `scheduler:billing:${Math.floor(minute / 360)}`,
          30 * 60_000,
          () => reconcileBillingSubscriptions(),
        )
      }

      const week = utcWeekKey(now)
      const digestMarker = `scheduler:digest-complete:${week}`
      const digestWeekday = Number(process.env.DIGEST_WEEKDAY_UTC ?? '1')
      const digestHour = Number(process.env.DIGEST_HOUR_UTC ?? '8')
      if (
        now.getUTCDay() === digestWeekday
        && now.getUTCHours() === digestHour
        && !await redis.get(digestMarker)
      ) {
        await withRedisLock(
          redis,
          `scheduler:digest-lock:${week}`,
          30 * 60_000,
          async () => {
            if (await redis.get(digestMarker)) return
            await enqueueWeeklyDigests(now)
            await redis.set(digestMarker, '1', 'EX', 9 * 24 * 60 * 60)
          },
        )
      }

      const day = now.toISOString().slice(0, 10)
      const cleanupMarker = `scheduler:cleanup-complete:${day}`
      if (!await redis.get(cleanupMarker)) {
        await withRedisLock(
          redis,
          `scheduler:cleanup-lock:${day}`,
          10 * 60_000,
          async () => {
            if (await redis.get(cleanupMarker)) return
            await cleanupOperationalData()
            await redis.set(cleanupMarker, '1', 'EX', 3 * 24 * 60 * 60)
          },
        )
      }

      lastSchedulerSuccess = Date.now()
    } catch (error) {
      Sentry.captureException(error, { tags: { component: 'worker-scheduler' } })
      logger.error({ error }, 'Scheduled backend maintenance failed')
    }
  }

  void runScheduledWork()
  const scheduler = setInterval(() => void runScheduledWork(), 60_000)
  scheduler.unref()

  const heartbeat = process.env.WORKER_HEALTHCHECK_URL
    ? setInterval(() => {
        fetchWithTimeout(process.env.WORKER_HEALTHCHECK_URL!, {}, 5_000)
          .catch((error) => logger.error({ error }, 'Worker heartbeat failed'))
      }, 60_000)
    : undefined
  heartbeat?.unref()

  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath('/admin/queues')
  createBullBoard({
    queues: queueEntries.map(([, queue]) => new BullMQAdapter(queue)),
    serverAdapter,
  })

  const app = express()
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) throw new Error('ADMIN_SECRET environment variable is required')

  app.disable('x-powered-by')
  app.get('/healthz', (_request, response) => {
    response
      .status(shuttingDown ? 503 : 200)
      .set('Cache-Control', 'no-store')
      .json({
        status: shuttingDown ? 'stopping' : 'ok',
        service: 'buyerwatch-worker',
        release: release ?? 'development',
      })
  })

  app.get('/readyz', async (_request, response) => {
    let pingOk = false
    try {
      pingOk = await withTimeout(redis.ping(), 3_000, 'worker redis ping') === 'PONG'
    } catch {
      pingOk = false
    }
    const schedulerHealthy =
      (
        lastSchedulerSuccess > 0
        && Date.now() - lastSchedulerSuccess < 5 * 60_000
      )
      || Date.now() - schedulerStartedAt < 2 * 60_000
    const ready =
      !shuttingDown
      && redisReady
      && pingOk
      && readyWorkers.size === workers.length
      && schedulerHealthy
    response
      .status(ready ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({
        status: ready ? 'ok' : 'degraded',
        redis: redisReady && pingOk ? 'ok' : 'error',
        scheduler: schedulerHealthy ? 'ok' : 'stale',
        workersReady: readyWorkers.size,
        workersExpected: workers.length,
      })
  })

  const requireAdmin: express.RequestHandler = (request, response, next) => {
    if (!safeBearerMatch(request.headers.authorization, adminSecret)) {
      response.status(401).send('Unauthorized')
      return
    }
    next()
  }

  app.get('/metrics', requireAdmin, async (_request, response) => {
    const lines = [
      '# HELP buyerwatch_worker_jobs_total Jobs observed by this worker process.',
      '# TYPE buyerwatch_worker_jobs_total counter',
    ]
    for (const [queue, metric] of metrics) {
      const label = sanitizeMetricLabel(queue)
      lines.push(`buyerwatch_worker_jobs_total{queue="${label}",result="completed"} ${metric.completed}`)
      lines.push(`buyerwatch_worker_jobs_total{queue="${label}",result="failed"} ${metric.failed}`)
    }

    lines.push('# HELP buyerwatch_queue_jobs Current BullMQ job counts.')
    lines.push('# TYPE buyerwatch_queue_jobs gauge')
    for (const [queueName, queue] of queueEntries) {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed')
      const label = sanitizeMetricLabel(queueName)
      for (const [state, value] of Object.entries(counts)) {
        lines.push(`buyerwatch_queue_jobs{queue="${label}",state="${state}"} ${value}`)
      }
      const [oldest] = await queue.getJobs(['waiting'], 0, 0, true)
      const ageSeconds = oldest?.timestamp
        ? Math.max(0, Math.floor((Date.now() - oldest.timestamp) / 1_000))
        : 0
      lines.push(`buyerwatch_queue_oldest_waiting_age_seconds{queue="${label}"} ${ageSeconds}`)
    }
    response.type('text/plain; version=0.0.4').send(`${lines.join('\n')}\n`)
  })

  app.post('/admin/dead-letter/:jobId/replay', requireAdmin, async (request, response) => {
    const rawDeadLetterId = request.params.jobId
    const deadLetterId = Array.isArray(rawDeadLetterId)
      ? rawDeadLetterId[0]
      : rawDeadLetterId
    if (!deadLetterId || deadLetterId.length > 200) {
      response.status(400).json({ error: 'invalid_dead_letter_id' })
      return
    }
    const deadLetter = await deadLetterQueue.getJob(deadLetterId)
    if (!deadLetter) {
      response.status(404).json({ error: 'dead_letter_not_found' })
      return
    }
    const payload = deadLetter.data as {
      queueName?: string
      jobId?: string
      jobName?: string
      payload?: unknown
      options?: { attempts?: number; backoff?: unknown }
    }
    const target = queueEntries.find(([name]) => name === payload.queueName)
    if (!target || target[0] === 'dead-letter' || !payload.jobName) {
      response.status(422).json({ error: 'dead_letter_not_replayable' })
      return
    }

    if (payload.jobId) {
      const existing = await target[1].getJob(payload.jobId)
      if (existing) {
        if (!await existing.isFailed()) {
          response.status(409).json({ error: 'original_job_is_not_failed' })
          return
        }
        await existing.remove()
      }
    }
    const replayed = await target[1].add(
      payload.jobName,
      payload.payload,
      {
        jobId: payload.jobId,
        attempts: payload.options?.attempts,
        backoff: payload.options?.backoff as never,
      },
    )
    await deadLetter.remove()
    logger.info(
      { queue: target[0], jobId: replayed.id, deadLetterId },
      'Dead-letter job replayed',
    )
    response.status(202).json({ success: true, queue: target[0], jobId: replayed.id })
  })

  app.use('/admin/queues', requireAdmin, serverAdapter.getRouter())

  const port = Number(process.env.PORT ?? process.env.WORKER_PORT ?? 3001)
  let server: Server
  await new Promise<void>((resolve) => {
    server = app.listen(port, '0.0.0.0', () => {
      logger.info({ port }, 'Worker administration server ready')
      resolve()
    })
  })

  const closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()))
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'Graceful worker shutdown started')
    if (heartbeat) clearInterval(heartbeat)
    clearInterval(scheduler)

    const closeOperation = Promise.allSettled([
      closeServer(),
      ...workers.map((worker) => worker.close()),
      ...queueEntries.map(([, queue]) => queue.close()),
    ]).then(async () => {
      await Promise.allSettled([redis.quit(), queueRedis.quit(), Sentry.flush(2_000)])
    })

    try {
      await withTimeout(closeOperation, 25_000, 'worker graceful shutdown')
      logger.info('Graceful worker shutdown complete')
      process.exitCode = 0
    } catch (error) {
      logger.error({ error }, 'Graceful worker shutdown timed out')
      process.exitCode = 1
    }
  }

  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
  logger.info({ workers: workers.length }, 'BuyerWatch workers initialized')

  return { app, workers, shutdown }
}
