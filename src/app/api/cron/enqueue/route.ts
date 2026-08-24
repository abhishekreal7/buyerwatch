import { NextResponse } from 'next/server'
import { fetchWithTimeout, withTimeout } from '@/lib/http'
import { logger } from '@/lib/logger'
import {
  ensureMonitoringSchedule,
  hasQStashConfiguration,
  verifyQStashRequest,
} from '@/lib/qstash'
import { isUuid, readTextBody, RequestInputError } from '@/lib/request'
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth'
import {
  hasCloudflareMonitoringConfiguration,
  isAuthorizedCloudflareMonitoringRequest,
} from '@/lib/cloudflare-rss-shadow'
import { runServerlessMonitoring } from '@/lib/serverless-monitor'
import { runRedditDeliveryCanary } from '@/lib/reddit-delivery-canary'
import { deliverPendingIncidentEmails } from '@/lib/incident-email'
import { runRedditApisBalanceMonitor } from '@/lib/redditapis-balance-monitor'
import { runRedditReplyTracker } from '@/lib/reddit-reply-tracking'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const subredditPattern = /^[a-z0-9_]{2,50}$/

async function executeMonitor(
  forceUserId?: string,
  forcePlatform?: 'reddit' | 'bluesky' | 'x',
  forceTarget?: string,
  runCanary = false,
) {
  try {
    const balanceMonitorPromise = runRedditApisBalanceMonitor().catch((error) => {
      logger.error({ error }, 'RedditAPIs balance monitor crashed')
      return { status: 'unavailable' as const, alerted: false }
    })
    const canaryPromise = runCanary
      ? runRedditDeliveryCanary().catch((error) => {
          logger.error({ error }, 'Reddit delivery canary crashed')
          return { status: 'failed' as const, code: 'canary_crashed' }
        })
      : null
    const replyTrackingPromise = runRedditReplyTracker().catch((error) => {
      logger.error({ error }, 'Reddit reply tracker crashed')
      return { status: 'unavailable' as const }
    })
    const result = await runServerlessMonitoring(new Date(), {
      forceUserId,
      forcePlatform,
      forceTarget,
    })

    if (forceUserId && result.status === 'already_running') {
      return NextResponse.json(
        { error: 'monitor_busy' },
        { status: 503 },
      )
    }

    if (process.env.HEALTHCHECK_PING_URL && result.status === 'completed') {
      try {
        await fetchWithTimeout(process.env.HEALTHCHECK_PING_URL, {}, 5_000)
      } catch (error) {
        logger.warn({ error }, 'Monitor healthcheck ping failed')
      }
    }

    const [canary, redditApisBalance, redditReplyTracking] = await Promise.all([
      canaryPromise,
      balanceMonitorPromise,
      replyTrackingPromise,
    ])
    const incidentEmail = await deliverPendingIncidentEmails(20).catch((error) => {
      logger.error({ error }, 'Customer incident email queue failed')
      return { claimed: 0, delivered: 0, failed: 1 }
    })
    return NextResponse.json({
      ...result,
      ...(canary ? { redditDeliveryCanary: canary } : {}),
      redditApisBalance,
      redditReplyTracking,
      incidentEmail,
    })
  } catch (error) {
    logger.error({ err: error }, 'Serverless Reddit monitor failed')
    return NextResponse.json(
      { error: 'serverless_monitor_failed' },
      { status: 503 },
    )
  }
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const isCloudflareScheduler = hasCloudflareMonitoringConfiguration()
    && isAuthorizedCloudflareMonitoringRequest(authorization)
  const isQStashScheduler = hasQStashConfiguration()

  if (!isCloudflareScheduler && !isQStashScheduler) {
    logger.error('QStash signing keys are not configured')
    return NextResponse.json(
      { error: 'monitor_scheduler_not_configured' },
      { status: 503 },
    )
  }

  let body: string
  try {
    body = await readTextBody(request, 4_096)
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.message === 'request_too_large' ? 413 : 400,
          headers: { 'Upstash-NonRetryable-Error': 'true' },
        },
      )
    }
    throw error
  }
  if (!isCloudflareScheduler && !await verifyQStashRequest(request, body)) {
    logger.warn('Rejected invalid QStash monitor request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!body.trim() && !isCloudflareScheduler) {
    await withTimeout(
      ensureMonitoringSchedule(),
      5_000,
      'QStash schedule self-check',
    ).catch((error) => {
      logger.error({ error }, 'Unable to verify the QStash monitoring schedule')
    })
  }

  let forceUserId: string | undefined
  let forcePlatform: 'reddit' | 'bluesky' | 'x' | undefined
  let forceTarget: string | undefined
  if (body.trim()) {
    try {
      const payload = JSON.parse(body) as {
        forceUserId?: unknown
        forcePlatform?: unknown
        forceTarget?: unknown
      }
      if (payload.forceUserId !== undefined) {
        if (!isUuid(payload.forceUserId)) {
          return NextResponse.json(
            { error: 'Invalid payload' },
            {
              status: 489,
              headers: { 'Upstash-NonRetryable-Error': 'true' },
            },
          )
        }
        forceUserId = payload.forceUserId
      }
      if (payload.forcePlatform !== undefined) {
        if (!['reddit', 'bluesky', 'x'].includes(String(payload.forcePlatform))) {
          return NextResponse.json(
            { error: 'Invalid payload' },
            {
              status: 489,
              headers: { 'Upstash-NonRetryable-Error': 'true' },
            },
          )
        }
        forcePlatform = payload.forcePlatform as 'reddit' | 'bluesky' | 'x'
      }
      if (payload.forceTarget !== undefined) {
        const normalizedTarget = typeof payload.forceTarget === 'string'
          ? payload.forceTarget.trim()
          : ''
        const validTarget = forcePlatform === 'reddit'
          ? subredditPattern.test(normalizedTarget.toLowerCase())
          : normalizedTarget.length > 0 && normalizedTarget.length <= 200
        if (
          !forceUserId
          || !forcePlatform
          || !validTarget
        ) {
          return NextResponse.json(
            { error: 'Invalid payload' },
            {
              status: 489,
              headers: { 'Upstash-NonRetryable-Error': 'true' },
            },
          )
        }
        forceTarget = forcePlatform === 'reddit'
          ? normalizedTarget.toLowerCase()
          : normalizedTarget
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid payload' },
        {
          status: 489,
          headers: { 'Upstash-NonRetryable-Error': 'true' },
        },
      )
    }
  }

  return executeMonitor(forceUserId, forcePlatform, forceTarget, !body.trim())
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(
    request.headers.get('authorization'),
    process.env.CRON_SECRET,
  )) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return executeMonitor(undefined, undefined, undefined, true)
}
