import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { verifyQStashRequest } from '@/lib/qstash'
import { isUuid } from '@/lib/request'
import {
  isRetryableSendError,
  processSendReply,
  type SendReplyData,
} from '@/lib/send-reply'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_ATTEMPTS = 5

function invalidPayload() {
  return NextResponse.json(
    { error: 'Invalid payload' },
    { status: 489, headers: { 'Upstash-NonRetryable-Error': 'true' } },
  )
}

function isSendReplyData(value: unknown): value is SendReplyData {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<SendReplyData>
  return Boolean(
    isUuid(message.userId)
    && isUuid(message.threadId)
    && typeof message.threadExternalId === 'string'
    && message.threadExternalId.length > 0
    && message.threadExternalId.length <= 2_000
    && typeof message.text === 'string'
    && message.text.trim().length > 0
    && message.text.length <= 10_000
    && (message.sourceTarget === undefined || (
      typeof message.sourceTarget === 'string'
      && message.sourceTarget.trim().length > 0
      && message.sourceTarget.length <= 200
    ))
    && (message.platform === 'reddit' || message.platform === 'bluesky')
    && (message.triggerType === 'manual' || message.triggerType === 'auto')
  )
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!await verifyQStashRequest(request, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let message: unknown
  try {
    message = JSON.parse(rawBody)
  } catch {
    return invalidPayload()
  }
  if (!isSendReplyData(message)) return invalidPayload()

  const retried = Math.max(0, Number(request.headers.get('upstash-retried') ?? '0') || 0)
  try {
    const result = await processSendReply(message, {
      attempt: retried + 1,
      maxAttempts: MAX_ATTEMPTS,
      jobId: request.headers.get('upstash-message-id') ?? undefined,
    })
    return NextResponse.json(result)
  } catch (error) {
    const retryable = isRetryableSendError(error)
    logger.error({ error, threadId: message.threadId, attempt: retried + 1 }, 'QStash reply send failed')
    return NextResponse.json(
      { error: retryable ? 'reply_send_retrying' : 'reply_send_failed' },
      retryable
        ? { status: 503 }
        : { status: 489, headers: { 'Upstash-NonRetryable-Error': 'true' } },
    )
  }
}
