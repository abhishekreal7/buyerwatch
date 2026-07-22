import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import DodoPayments from 'dodopayments'

/**
 * POST /api/billing/webhook
 *
 * Receives Dodo Payments subscription lifecycle events and updates the user's
 * plan + keyword rule state accordingly.
 *
 * SECURITY — fail-closed design:
 *   - If DODO_PAYMENTS_WEBHOOK_SECRET is missing → reject (never accept unverified)
 *   - Verification uses client.webhooks.unwrap() from the Dodo SDK, which internally
 *     validates the webhook-id, webhook-signature, and webhook-timestamp headers
 *     using the Standard Webhooks specification (not plain HMAC — do not replace
 *     with a manual crypto implementation)
 *   - All errors from unwrap() are caught and return 401
 *
 * Events handled:
 *   subscription.active    → activate pro | growth plan
 *   subscription.updated   → re-sync plan on renewal / change
 *   subscription.cancelled → downgrade to free, pause excess keyword rules
 *   subscription.on_hold   → payment failed; keep plan active but flag (no punitive action)
 *   payment.failed         → log only; plan stays intact until subscription.on_hold or
 *                            subscription.cancelled fires — Dodo retries before cancelling
 *
 * Downgrade contract (unchanged from previous version):
 *   - Do NOT delete keyword rules, thread history, or draft history
 *   - Keep the most-recently-updated keyword active, pause all others
 *   - User sees a persistent banner to upgrade and reactivate
 *
 * TODO: register this URL in the Dodo Payments dashboard → Webhooks → Add endpoint.
 *       Set DODO_PAYMENTS_WEBHOOK_SECRET from the Dodo dashboard after creation.
 */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Enforce keyword rules after a downgrade to free.
 * Keeps the most-recently-updated keyword active, pauses all others.
 * Never deletes data.
 */
async function enforceDowngradeKeywordLimit(userId: string, supabase: ReturnType<typeof getSupabase>) {
  const { data: keywords, error } = await supabase
    .from('keywords')
    .select('id, is_active, updated_at, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false, nullsFirst: false })

  if (error || !keywords || keywords.length <= 1) return

  const [keepActive, ...toDeactivate] = keywords

  if (toDeactivate.length === 0) return

  await supabase
    .from('keywords')
    .update({ is_active: false })
    .in('id', toDeactivate.map((k) => k.id))
    .eq('user_id', userId)

  await supabase
    .from('keywords')
    .update({ is_active: true })
    .eq('id', keepActive.id)
    .eq('user_id', userId)

  console.info(`[billing/webhook] Downgrade: kept rule ${keepActive.id} active, paused ${toDeactivate.length} rules for user ${userId}`)
}

export async function POST(req: Request) {
  // ── 1. Fail-closed: reject immediately if secret is not configured ──────
  const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[billing/webhook] DODO_PAYMENTS_WEBHOOK_SECRET is not set — rejecting all requests')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
  }

  const apiKey = process.env.DODO_PAYMENTS_API_KEY
  if (!apiKey) {
    console.error('[billing/webhook] DODO_PAYMENTS_API_KEY is not set — cannot initialise client')
    return NextResponse.json({ error: 'API key not configured' }, { status: 401 })
  }

  // ── 2. Read the raw body (required for signature verification) ──────────
  const rawBody = await req.text()

  // ── 3. Verify signature via the Dodo SDK (Standard Webhooks spec) ───────
  //    The SDK validates webhook-id + webhook-signature + webhook-timestamp.
  //    This is NOT plain HMAC — do not replace with a manual crypto.createHmac call.
  //    unwrap() throws on any verification failure; we catch and return 401.
  const client = new DodoPayments({
    bearerToken: apiKey,
    webhookKey: webhookSecret,
    environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
  })

  let event: any
  try {
    event = client.webhooks.unwrap(rawBody, {
      headers: {
        'webhook-id':        req.headers.get('webhook-id')        ?? '',
        'webhook-signature': req.headers.get('webhook-signature') ?? '',
        'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
      },
    })
  } catch (err: any) {
    // Covers: invalid signature, missing headers, expired timestamp, malformed payload
    console.warn('[billing/webhook] Signature verification failed:', err?.message ?? err)
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  // ── 4. Extract user identity from metadata ──────────────────────────────
  const eventType: string = event?.type ?? ''
  const metadata = event?.data?.metadata ?? {}
  const userId: string | undefined = metadata.user_id
  const requestedPlan: string | undefined = metadata.plan  // 'pro' | 'growth'

  if (!userId) {
    console.warn(`[billing/webhook] No metadata.user_id for event "${eventType}" — cannot update plan`)
    // Return 200 so Dodo doesn't retry; this is a configuration issue, not a transient error
    return NextResponse.json({ received: true })
  }

  const supabase = getSupabase()

  // ── 5. Route by event type ───────────────────────────────────────────────
  switch (eventType) {
    case 'subscription.active':
    case 'subscription.updated': {
      // Use the plan from checkout metadata, falling back to 'pro' if missing
      const newPlan = (requestedPlan === 'growth' || requestedPlan === 'pro') ? requestedPlan : 'pro'

      const { error } = await supabase
        .from('profiles')
        .update({ plan: newPlan })
        .eq('id', userId)

      if (error) {
        console.error(`[billing/webhook] Failed to upgrade plan for ${userId}:`, error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }
      console.info(`[billing/webhook] ${eventType}: set plan=${newPlan} for user ${userId}`)
      break
    }

    case 'subscription.cancelled': {
      // Hard cancellation — downgrade immediately and pause excess keyword rules
      const { error } = await supabase
        .from('profiles')
        .update({ plan: 'free', auto_send_enabled: false })
        .eq('id', userId)

      if (error) {
        console.error(`[billing/webhook] Failed to downgrade plan for ${userId}:`, error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }

      await enforceDowngradeKeywordLimit(userId, supabase)
      console.info(`[billing/webhook] subscription.cancelled: downgraded user ${userId} to free`)
      break
    }

    case 'subscription.on_hold': {
      // Payment failed and Dodo has paused the subscription.
      // Strategy: keep the plan active — Dodo will retry and fire subscription.cancelled
      // if all retries fail. Punishing users immediately for a single failed payment
      // (e.g. card expired but not yet updated) is bad UX and bad revenue practice.
      // Log only; the dunning/cancellation path will fire if retries exhaust.
      console.info(`[billing/webhook] subscription.on_hold for user ${userId} — plan unchanged, awaiting Dodo retry`)
      break
    }

    case 'payment.failed': {
      // Individual payment failure (before subscription-level retry exhaustion).
      // Same strategy as on_hold: do not downgrade prematurely.
      // If Dodo exhausts retries it will fire subscription.on_hold then subscription.cancelled.
      console.info(`[billing/webhook] payment.failed for user ${userId} — plan unchanged, Dodo will retry`)
      break
    }

    default:
      // Other events (payment.succeeded, invoices, etc.) — acknowledge without action
      console.info(`[billing/webhook] Unhandled event "${eventType}" for user ${userId} — no-op`)
      break
  }

  return NextResponse.json({ received: true })
}
