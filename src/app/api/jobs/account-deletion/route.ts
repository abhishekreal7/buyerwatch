import { NextResponse } from 'next/server'
import { processAccountDeletion } from '@/lib/account-deletion'
import { logger } from '@/lib/logger'
import { verifyQStashRequest } from '@/lib/qstash'
import { isUuid, readTextBody, RequestInputError } from '@/lib/request'

export async function POST(request: Request) {
  let body: string
  try {
    body = await readTextBody(request, 2_048)
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'request_too_large' ? 413 : 400 },
      )
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  if (!await verifyQStashRequest(request, body)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let userId: unknown
  try {
    userId = (JSON.parse(body) as { userId?: unknown }).userId
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }
  if (!isUuid(userId)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }
  try {
    await processAccountDeletion(userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error(
      { code: error instanceof Error ? error.name : 'unknown' },
      'Queued account deletion retry failed',
    )
    return NextResponse.json({ error: 'account_deletion_retry_failed' }, { status: 503 })
  }
}
