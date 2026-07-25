import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import DodoPayments from 'dodopayments'

type BillingPlan = 'pro' | 'growth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function getPlan(value: unknown): BillingPlan | null {
  return value === 'pro' || value === 'growth' ? value : null
}

export async function POST(req: Request) {
  const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET
  const apiKey = process.env.DODO_PAYMENTS_API_KEY
  if (!webhookSecret || !apiKey) {
    console.error('[billing/webhook] Required Dodo configuration is missing')
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })
  }

  const rawBody = await req.text()
  const client = new DodoPayments({
    bearerToken: apiKey,
    webhookKey: webhookSecret,
    environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
  })

  let event: Record<string, any>
  try {
    event = client.webhooks.unwrap(rawBody, {
      headers: {
        'webhook-id': req.headers.get('webhook-id') ?? '',
        'webhook-signature': req.headers.get('webhook-signature') ?? '',
        'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
      },
    }) as Record<string, any>
  } catch {
    return NextResponse.json({ error: 'invalid_webhook_signature' }, { status: 401 })
  }

  const eventId = req.headers.get('webhook-id')
  const eventType = typeof event.type === 'string' ? event.type : ''
  const data = event.data ?? {}
  const metadata = data.metadata ?? {}
  const userId = typeof metadata.user_id === 'string' ? metadata.user_id : null
  const plan = getPlan(metadata.plan)
  const subscriptionId =
    typeof data.subscription_id === 'string' ? data.subscription_id : null
  const customerId =
    typeof data.customer?.customer_id === 'string'
      ? data.customer.customer_id
      : typeof data.customer_id === 'string'
        ? data.customer_id
        : null
  const eventAt = typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString()

  if (!eventId) {
    return NextResponse.json({ error: 'missing_webhook_id' }, { status: 400 })
  }

  if (!eventType.startsWith('subscription.')) {
    return NextResponse.json({ received: true, result: 'ignored' })
  }

  if (!userId || !plan || !subscriptionId) {
    console.error('[billing/webhook] Subscription event has incomplete checkout metadata', {
      eventId,
      eventType,
      hasUserId: Boolean(userId),
      hasPlan: Boolean(plan),
      hasSubscriptionId: Boolean(subscriptionId),
    })
    return NextResponse.json({ received: true, result: 'invalid_metadata' })
  }

  if (!['subscription.active', 'subscription.updated', 'subscription.cancelled'].includes(eventType)) {
    return NextResponse.json({ received: true, result: 'ignored' })
  }

  const { data: result, error } = await getSupabase().rpc('apply_billing_subscription_event', {
    p_event_id: eventId,
    p_event_type: eventType,
    p_user_id: userId,
    p_subscription_id: subscriptionId,
    p_customer_id: customerId,
    p_plan: plan,
    p_event_at: eventAt,
  })

  if (error) {
    console.error('[billing/webhook] Atomic event application failed', {
      eventId,
      eventType,
      code: error.code,
    })
    return NextResponse.json({ error: 'billing_event_failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true, result })
}
