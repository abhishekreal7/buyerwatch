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
import { runServerlessMonitoring } from '@/lib/serverless-monitor'
import { runRedditDeliveryCanary } from '@/lib/reddit-delivery-canary'
import { deliverPendingIncidentEmails } from '@/lib/incident-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const subredditPattern = /^[a-z0-9_]{2,50}$/

async function executeMonitor(
  forceUserId?: string,
  forcePlatform?: 'reddit' | 'bluesky',
  forceTarget?: string,
  runCanary = false,
) {
  try {
    const canaryPromise = runCanary
      ? runRedditDeliveryCanary().catch((error) => {
          logger.error({ error }, 'Reddit delivery canary crashed')
          return { status: 'failed' as const, code: 'canary_crashed' }
        })
      : null
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

    const canary = canaryPromise ? await canaryPromise : null
    const incidentEmail = await deliverPendingIncidentEmails(20).catch((error) => {
      logger.error({ error }, 'Customer incident email queue failed')
      return { claimed: 0, delivered: 0, failed: 1 }
    })
    return NextResponse.json({
      ...result,
      ...(canary ? { redditDeliveryCanary: canary } : {}),
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
  if (!hasQStashConfiguration()) {
    logger.error('QStash signing keys are not configured')
    return NextResponse.json(
      { error: 'qstash_not_configured' },
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
  if (!await verifyQStashRequest(request, body)) {
    logger.warn('Rejected invalid QStash monitor request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!body.trim()) {
    await withTimeout(
      ensureMonitoringSchedule(),
      5_000,
      'QStash schedule self-check',
    ).catch((error) => {
      logger.error({ error }, 'Unable to verify the QStash monitoring schedule')
    })
  }

  let forceUserId: string | undefined
  let forcePlatform: 'reddit' | 'bluesky' | undefined
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
        if (payload.forcePlatform !== 'reddit' && payload.forcePlatform !== 'bluesky') {
          return NextResponse.json(
            { error: 'Invalid payload' },
            {
              status: 489,
              headers: { 'Upstash-NonRetryable-Error': 'true' },
            },
          )
        }
        forcePlatform = payload.forcePlatform
      }
      if (payload.forceTarget !== undefined) {
        const normalizedTarget = typeof payload.forceTarget === 'string'
          ? payload.forceTarget.trim()
          : ''
        const validTarget = forcePlatform === 'bluesky'
          ? normalizedTarget.length > 0 && normalizedTarget.length <= 200
          : subredditPattern.test(normalizedTarget.toLowerCase())
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
