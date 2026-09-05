import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/admin'
import { applyAiSettlement, isAiSettlementMessage } from '@/lib/ai-settlement'
import { logger } from '@/lib/logger'
import { verifyQStashRequest } from '@/lib/qstash'
import { readTextBody, RequestInputError } from '@/lib/request'

export async function POST(request: Request) {
  let rawBody: string
  try {
    rawBody = await readTextBody(request, 16_384)
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'request_too_large' ? 413 : 400 },
      )
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  if (!await verifyQStashRequest(request, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let message: unknown
  try {
    message = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }
  if (!isAiSettlementMessage(message)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  try {
    await applyAiSettlement(getServiceRoleClient(), message)
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error(
      { error, settlementId: message.id, operation: message.operation },
      'Durable AI settlement attempt failed',
    )
    return NextResponse.json({ error: 'ai_settlement_failed' }, { status: 503 })
  }
}

