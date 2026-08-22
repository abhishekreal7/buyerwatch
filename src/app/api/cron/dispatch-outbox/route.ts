import { NextResponse } from 'next/server'
import { dispatchPendingOutbox } from '@/lib/backend-maintenance'
import { logger } from '@/lib/logger'
import { isUuid, readTextBody, RequestInputError } from '@/lib/request'
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

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

  let threadId: unknown
  try {
    threadId = (JSON.parse(rawBody) as { threadId?: unknown }).threadId
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  if (!isUuid(threadId)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  try {
    const dispatched = await dispatchPendingOutbox(1, threadId)
    return NextResponse.json({ status: 'completed', dispatched })
  } catch (error) {
    logger.error({ error, threadId }, 'Protected outbox dispatch failed')
    return NextResponse.json(
      { error: 'outbox_dispatch_failed' },
      { status: 503 },
    )
  }
}
