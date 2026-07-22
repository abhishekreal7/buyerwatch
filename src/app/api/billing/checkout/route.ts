import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import DodoPayments from 'dodopayments'

/**
 * POST /api/billing/checkout
 *
 * Creates a Dodo Payments hosted checkout session and returns the redirect URL.
 * Accepts optional `plan` body param ('pro' | 'growth') — defaults to 'pro'.
 *
 * The user is identified via Supabase session; their ID + email are passed as
 * checkout metadata so the webhook can map the payment to a Scouto account.
 *
 * UX flow:
 *   user clicks Upgrade → POST here → redirect to Dodo hosted checkout →
 *   payment → Dodo fires webhook → webhook upgrades plan in Supabase
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.DODO_PAYMENTS_API_KEY
    const proProductId = process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
    const growthProductId = process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID

    if (!apiKey || !proProductId) {
      return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
    }

    // Parse requested plan from body (optional — defaults to 'pro')
    let body: { plan?: string } = {}
    try {
      body = await req.json()
    } catch {
      // no body is fine
    }
    const requestedPlan = body.plan === 'growth' ? 'growth' : 'pro'
    const productId = requestedPlan === 'growth' ? (growthProductId ?? proProductId) : proProductId

    const dodo = new DodoPayments({
      bearerToken: apiKey,
      environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
    })

    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email ?? '',
      },
      // metadata is returned verbatim in every webhook event —
      // the webhook handler reads metadata.user_id and metadata.plan
      metadata: {
        user_id: user.id,
        plan: requestedPlan,
      },
      return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/dashboard`,
    })

    const checkoutUrl = (session as any).checkout_url ?? (session as any).url

    if (!checkoutUrl) {
      console.error('[billing/checkout] Dodo session missing checkout_url:', session)
      return NextResponse.json({ error: 'checkout_url_not_found' }, { status: 500 })
    }

    return NextResponse.json({ url: checkoutUrl })

  } catch (error: any) {
    console.error('[billing/checkout] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
