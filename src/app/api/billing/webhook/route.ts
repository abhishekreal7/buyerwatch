import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import DodoPayments from 'dodopayments'
import { readTextBody, RequestInputError } from '@/lib/request'
import {
  getAddonCredits,
  getAddonTypeFromProductId,
  normalizeAddonType,
} from '@/lib/billing-addons-server'
import { getDodoEnvironment, getDodoProductId } from '@/lib/dodo'

type BillingPlan = 'starter' | 'pro' | 'growth'
type BillingStatus = 'pending' | 'active' | 'on_hold' | 'cancelled' | 'failed' | 'expired'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function getPlan(productId: string | null): BillingPlan | null {
  if (productId === process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID) return 'starter'
  if (productId === process.env.DODO_PAYMENTS_PRO_PRODUCT_ID) return 'pro'
  if (productId === process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID) return 'growth'
  return null
}

function getStatus(eventType: string, value: unknown): BillingStatus | null {
  if (['pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired'].includes(String(value))) {
    return value as BillingStatus
  }
  if (eventType.includes('active') || eventType.includes('renewed')) return 'active'
  if (eventType.includes('cancel')) return 'cancelled'
  if (eventType.includes('fail')) return 'failed'
  if (eventType.includes('expire')) return 'expired'
  if (eventType.includes('hold') || eventType.includes('paused')) return 'on_hold'
  return null
}

function isSuccessfulOneTimePayment(eventType: string, value: unknown): boolean {
  const status = String(value ?? '').toLowerCase()
  return (
    eventType.includes('succeeded')
    || eventType.includes('success')
    || eventType.includes('completed')
    || ['succeeded', 'success', 'completed', 'paid'].includes(status)
  )
}

function getPaymentId(data: Record<string, any>, eventId: string): string {
  return (
    typeof data.payment_id === 'string'
      ? data.payment_id
      : typeof data.payment?.payment_id === 'string'
        ? data.payment.payment_id
        : typeof data.id === 'string'
          ? data.id
          : eventId
  )
}

export async function POST(req: Request) {
  const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET
  const apiKey = process.env.DODO_PAYMENTS_API_KEY
  if (!webhookSecret || !apiKey) {
    console.error('[billing/webhook] Required Dodo configuration is missing')
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })
  }
  let environment: ReturnType<typeof getDodoEnvironment>
  try {
    environment = getDodoEnvironment()
  } catch {
    console.error('[billing/webhook] DODO_PAYMENTS_ENVIRONMENT is invalid')
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })
  }

  let rawBody: string
  try {
    rawBody = await readTextBody(req)
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'request_too_large' ? 413 : 400 },
      )
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const client = new DodoPayments({
    bearerToken: apiKey,
    webhookKey: webhookSecret,
    environment,
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
  let userId = typeof metadata.user_id === 'string' ? metadata.user_id : null
  const subscriptionId =
    typeof data.subscription_id === 'string' ? data.subscription_id : null
  let productId = getDodoProductId(data)
  let plan = getPlan(productId)
  const providerStatus = getStatus(eventType, data.status)
  const customerId =
    typeof data.customer?.customer_id === 'string'
      ? data.customer.customer_id
      : typeof data.customer_id === 'string'
        ? data.customer_id
        : null
  const parsedEventAt = typeof event.timestamp === 'string'
    ? new Date(event.timestamp)
    : new Date(Number.NaN)
  const eventAt = Number.isNaN(parsedEventAt.getTime())
    ? null
    : parsedEventAt.toISOString()
  const periodEndsAt =
    typeof data.next_billing_date === 'string'
      ? data.next_billing_date
      : typeof data.current_period_end === 'string'
        ? data.current_period_end
        : null

  if (!eventId) {
    return NextResponse.json({ error: 'missing_webhook_id' }, { status: 400 })
  }

  const metadataAddon = normalizeAddonType(metadata.addon_type)
  const productAddon = getAddonTypeFromProductId(productId)
  const addonType = metadata.purchase_type === 'addon'
    ? metadataAddon ?? productAddon
    : productAddon

  if (addonType && !eventType.startsWith('subscription.')) {
    if (!isSuccessfulOneTimePayment(eventType, data.status)) {
      return NextResponse.json({ received: true, result: 'ignored_addon_status' })
    }
    if (!userId || !eventAt) {
      console.error('[billing/webhook] Add-on event has incomplete checkout metadata', {
        eventId,
        eventType,
        hasUserId: Boolean(userId),
        addonType,
      })
      return NextResponse.json({ error: 'invalid_addon_event' }, { status: 500 })
    }

    // Credits are a server-owned entitlement. Never trust webhook metadata for
    // the quantity even though the event signature itself is authentic.
    const credits = getAddonCredits(addonType)
    const { data: result, error } = await getSupabase().rpc('apply_billing_addon_event', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_user_id: userId,
      p_payment_id: getPaymentId(data, eventId),
      p_product_id: productId,
      p_addon_type: addonType,
      p_quantity: 1,
      p_credits: credits,
      p_event_at: eventAt,
    })

    if (error) {
      console.error('[billing/webhook] Add-on event application failed', {
        eventId,
        eventType,
        code: error.code,
      })
      return NextResponse.json({ error: 'billing_addon_event_failed' }, { status: 500 })
    }

    return NextResponse.json({ received: true, result })
  }

  if (!eventType.startsWith('subscription.')) {
    return NextResponse.json({ received: true, result: 'ignored' })
  }

  if ((!userId || !productId) && subscriptionId) {
    const { data: existing } = await getSupabase()
      .from('profiles')
      .select('id, billing_product_id')
      .eq('billing_subscription_id', subscriptionId)
      .maybeSingle()
    userId ??= existing?.id ?? null
    productId ??= existing?.billing_product_id ?? null
    plan = getPlan(productId)
  }

  if (!userId || !plan || !subscriptionId || !productId || !providerStatus || !eventAt) {
    console.error('[billing/webhook] Subscription event has incomplete checkout metadata', {
      eventId,
      eventType,
      hasUserId: Boolean(userId),
      hasPlan: Boolean(plan),
      hasSubscriptionId: Boolean(subscriptionId),
    })
    // A signed subscription event that cannot be applied must be retried or
    // surfaced by the provider, never silently acknowledged.
    return NextResponse.json({ error: 'invalid_subscription_event' }, { status: 500 })
  }

  const { data: result, error } = await getSupabase().rpc('apply_billing_subscription_event_v2', {
    p_event_id: eventId,
    p_event_type: eventType,
    p_user_id: userId,
    p_subscription_id: subscriptionId,
    p_customer_id: customerId,
    p_plan: plan,
    p_provider_status: providerStatus,
    p_product_id: productId,
    p_period_ends_at: periodEndsAt,
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
