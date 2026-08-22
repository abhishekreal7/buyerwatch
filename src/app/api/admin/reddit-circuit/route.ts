import { NextResponse } from 'next/server'
import { requireAdminForAction } from '@/lib/admin'
import { getRedditDeliveryControl } from '@/lib/reddit-service-safety'
import { isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAdminForAction()
    return NextResponse.json(await getRedditDeliveryControl(), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    if (!isTrustedSameOriginMutation(request)) {
      return NextResponse.json({ error: 'untrusted_request_origin' }, { status: 403 })
    }
    const body = await readJsonBody<Record<string, unknown>>(request, 1_024)
    const action = body.action
    const confirmation = body.confirmation
    const { user, admin } = await requireAdminForAction()
    if (action === 'close') {
      if (confirmation !== 'REDDIT_DELIVERY_VERIFIED') {
        return NextResponse.json({ error: 'verification_required' }, { status: 400 })
      }
      const result = await admin.rpc('close_reddit_delivery_circuit_v1', {
        p_manual_override: true,
      })
      if (result.error) throw result.error
      logger.warn({ adminUser: user.id, action: 'close' }, 'Reddit delivery circuit manually changed')
      return NextResponse.json({ success: result.data === true })
    }
    if (action === 'open') {
      if (confirmation !== 'PAUSE_REDDIT_DELIVERY') {
        return NextResponse.json({ error: 'confirmation_required' }, { status: 400 })
      }
      const result = await admin.rpc('open_reddit_delivery_circuit_v1', {
        p_reason_code: 'manual_admin_pause',
        p_title: 'Reddit delivery is paused',
        p_message: 'Delivery was paused by BuyerWatch while the service is verified.',
        p_requires_manual_reset: true,
      })
      if (result.error) throw result.error
      logger.warn({ adminUser: user.id, action: 'open' }, 'Reddit delivery circuit manually changed')
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    logger.error({ error }, 'Reddit circuit action failed')
    return NextResponse.json({ error: 'circuit_action_failed' }, { status: 500 })
  }
}
