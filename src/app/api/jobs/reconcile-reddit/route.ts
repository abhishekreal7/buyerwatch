import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { verifyQStashRequest } from '@/lib/qstash'
import { isUuid, readTextBody, RequestInputError } from '@/lib/request'
import {
  isRetryableReconciliationError,
  reconcileRedditReply,
  type RedditReconciliationMessage,
} from '@/lib/reddit-send-reconciliation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function invalidPayload() {
  return NextResponse.json(
    { error: 'Invalid payload' },
    { status: 489, headers: { 'Upstash-NonRetryable-Error': 'true' } },
  )
}

function isMessage(value: unknown): value is RedditReconciliationMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<RedditReconciliationMessage>
  return Boolean(
    isUuid(message.userId)
    && isUuid(message.threadId)
    && (message.attempt === 1 || message.attempt === 2 || message.attempt === 3)
  )
}

export async function POST(request: Request) {
  let rawBody: string
  try {
    rawBody = await readTextBody(request, 2_048)
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: 413, headers: { 'Upstash-NonRetryable-Error': 'true' } },
      )
    }
    return invalidPayload()
  }
  if (!await verifyQStashRequest(request, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let message: unknown
  try {
    message = JSON.parse(rawBody)
  } catch {
    return invalidPayload()
  }
  if (!isMessage(message)) return invalidPayload()

  try {
    return NextResponse.json(await reconcileRedditReply(message))
  } catch (error) {
    const retryable = isRetryableReconciliationError(error)
    logger.error({
      threadId: message.threadId,
      attempt: message.attempt,
      errorCode: error instanceof Error ? error.message : 'unknown_error',
    }, 'Delayed Reddit reconciliation failed')
    return NextResponse.json(
      { error: retryable ? 'reconciliation_retrying' : 'reconciliation_failed' },
      retryable
        ? { status: 503 }
        : { status: 489, headers: { 'Upstash-NonRetryable-Error': 'true' } },
    )
  }
}
