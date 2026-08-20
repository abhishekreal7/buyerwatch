import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { withTimeout } from '@/lib/http'
import { logger } from '@/lib/logger'
import { verifyQStashRequest } from '@/lib/qstash'
import { redis } from '@/lib/redis'
import { readTextBody, RequestInputError } from '@/lib/request'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_CALLBACK_BYTES = 32_000
const SCHEDULE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,160}$/

type QStashFailureCallback = {
  scheduleId?: unknown
  createdAt?: unknown
  status?: unknown
  messageId?: unknown
  callerIP?: unknown
}

function safeText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maximum) : null
}

function adminRecipients(): string[] {
  return [...new Set((process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(value => value.trim().toLocaleLowerCase())
    .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))]
    .slice(0, 5)
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_CALLBACK_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
  }

  let rawBody: string
  try {
    rawBody = await readTextBody(request, MAX_CALLBACK_BYTES)
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json(
        { error: error.message === 'request_too_large' ? 'payload_too_large' : error.message },
        { status: error.message === 'request_too_large' ? 413 : 400 },
      )
    }
    throw error
  }
  if (!await verifyQStashRequest(request, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: QStashFailureCallback
  try {
    payload = JSON.parse(rawBody) as QStashFailureCallback
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const scheduleId = safeText(payload.scheduleId, 160)
  const createdAt = safeText(payload.createdAt, 32)
  const messageId = safeText(payload.messageId, 160)
  const status = Number(payload.status)
  if (!scheduleId || !SCHEDULE_ID_PATTERN.test(scheduleId) || !createdAt) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const dedupeKey = `alert:qstash-failure:${scheduleId}:${createdAt}`
  let dedupeReserved = false
  try {
    const reserved = await redis.set(dedupeKey, '1', 'EX', 24 * 60 * 60, 'NX')
    if (reserved !== 'OK') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    dedupeReserved = true
  } catch (error) {
    // Alert delivery is more important than deduplication during a cache
    // incident. Resend may deliver a duplicate, but the failure is not hidden.
    logger.warn({ error, scheduleId }, 'QStash failure-alert deduplication unavailable')
  }

  logger.error({ scheduleId, createdAt, messageId, status }, 'QStash monitoring delivery exhausted retries')

  const recipients = adminRecipients()
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  if (!apiKey || !from || recipients.length === 0) {
    return NextResponse.json({ received: true, alerted: false })
  }

  try {
    await withTimeout(new Resend(apiKey).emails.send({
      from,
      to: recipients,
      subject: 'BuyerWatch monitoring failed after all retries',
      text: [
        'The BuyerWatch QStash monitoring schedule exhausted all retries.',
        `Schedule: ${scheduleId}`,
        `Created at: ${createdAt}`,
        `Destination status: ${Number.isFinite(status) ? status : 'unknown'}`,
        `Message: ${messageId ?? 'unknown'}`,
        'Check Vercel runtime logs, /api/health/ready, and the QStash DLQ.',
      ].join('\n'),
    }), 10_000, 'QStash failure alert')
  } catch (error) {
    logger.error({ error, scheduleId }, 'Unable to deliver QStash failure alert')
    if (dedupeReserved) await redis.del(dedupeKey).catch(() => undefined)
    return NextResponse.json({ error: 'alert_delivery_failed' }, { status: 503 })
  }

  return NextResponse.json({ received: true, alerted: true })
}
