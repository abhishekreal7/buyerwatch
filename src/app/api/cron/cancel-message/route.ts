import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { cancelQStashMessage } from '@/lib/qstash'
import { readTextBody, RequestInputError } from '@/lib/request'
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const qstashMessageIdPattern = /^msg_[A-Za-z0-9]{20,200}$/

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(
    request.headers.get('authorization'),
    process.env.CRON_SECRET,
  )) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let rawBody: string
  try {
    rawBody = await readTextBody(request, 1_024)
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'request_too_large' ? 413 : 400 },
      )
    }
    throw error
  }

  let messageId: unknown
  try {
    messageId = (JSON.parse(rawBody) as { messageId?: unknown }).messageId
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  if (typeof messageId !== 'string' || !qstashMessageIdPattern.test(messageId)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  try {
    const cancelled = await cancelQStashMessage(messageId)
    return NextResponse.json({ status: 'completed', cancelled })
  } catch (error) {
    logger.error({
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }, 'Protected QStash message cancellation failed')
    return NextResponse.json(
      { error: 'qstash_message_cancellation_failed' },
      { status: 503 },
    )
  }
}
