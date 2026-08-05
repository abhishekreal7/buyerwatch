import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import DodoPayments from 'dodopayments'
import { createHash } from 'node:crypto'
import { getAppUrl } from '@/lib/app-url'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { readJsonBody, RequestInputError } from '@/lib/request'
import { BILLING_ADDONS, type BillingAddonType } from '@/lib/billing-addons'
import { getAddonProductId, normalizeAddonType } from '@/lib/billing-addons-server'

/**
 * POST /api/billing/checkout
 *
 * Creates a Dodo Payments hosted checkout session and returns the redirect URL.
 * Accepts either:
 * - optional `plan` body param ('pro' | 'growth') — defaults to 'pro'.
 * - optional `addon` body param ('signals' | 'drafts') for one-time credit packs.
 *
 * The user is identified via Supabase session; their ID + email are passed as
 * checkout metadata so the webhook can map the payment to a BuyerWatch account.
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
    const rate = await actionRateLimit.limit(`billing-checkout:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const apiKey = process.env.DODO_PAYMENTS_API_KEY
    const starterProductId = process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID
    const proProductId = process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
    const growthProductId = process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID

    if (!apiKey) {
      return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
    }

    // Parse requested checkout intent. Add-ons are one-time purchases and do
    // not mutate the user's subscription plan.
    const body = await readJsonBody<{ plan?: string; addon?: BillingAddonType }>(req, 1_024)
    const requestedAddon = normalizeAddonType(body.addon)

    if (requestedAddon) {
      const productId = getAddonProductId(requestedAddon)
      if (!productId) {
        return NextResponse.json({ error: 'addon_billing_not_configured' }, { status: 503 })
      }

      const dodo = new DodoPayments({
        bearerToken: apiKey,
        environment: process.env.DODO_PAYMENTS_ENVIRONMENT === 'test_mode'
          ? 'test_mode'
          : 'live_mode',
        timeout: 15_000,
        maxRetries: 1,
      })
      const addon = BILLING_ADDONS[requestedAddon]
      // Prefer a client-supplied key so intentional back-to-back pack purchases
      // each get a fresh checkout. Without one, use a short bucket so accidental
      // double-submits collapse but intentional repeats after ~30s still work.
      const clientIdempotencyKey = req.headers.get('idempotency-key')?.trim().slice(0, 100)
      const addonIdempotencySeed = clientIdempotencyKey
        || `bucket:${Math.floor(Date.now() / 30_000)}`
      const session = await dodo.checkoutSessions.create({
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: {
          email: user.email ?? '',
        },
        metadata: {
          user_id: user.id,
          purchase_type: 'addon',
          addon_type: requestedAddon,
          credits: String(addon.credits),
        },
        return_url: `${getAppUrl()}/dashboard?billing=addon`,
      }, {
        idempotencyKey: createHash('sha256')
          .update(`${user.id}:addon:${requestedAddon}:${addonIdempotencySeed}`)
          .digest('hex'),
      })

      const checkoutUrl = (session as any).checkout_url ?? (session as any).url
      if (!checkoutUrl) {
        console.error('[billing/checkout] Dodo add-on session did not include a checkout URL')
        return NextResponse.json({ error: 'checkout_url_not_found' }, { status: 500 })
      }

      return NextResponse.json({ url: checkoutUrl })
    }

    const requestedPlan = body.plan === 'growth' ? 'growth' : body.plan === 'starter' ? 'starter' : 'pro'
    const productId = requestedPlan === 'growth'
      ? growthProductId
      : requestedPlan === 'starter'
        ? starterProductId
        : proProductId
    if (!starterProductId || !proProductId || !growthProductId || !productId) {
      return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
    }

    const dodo = new DodoPayments({
      bearerToken: apiKey,
      environment: process.env.DODO_PAYMENTS_ENVIRONMENT === 'test_mode'
        ? 'test_mode'
        : 'live_mode',
      timeout: 15_000,
      maxRetries: 1,
    })

    const clientIdempotencyKey = req.headers.get('idempotency-key')?.trim().slice(0, 100)
    const planIdempotencySeed = clientIdempotencyKey
      || `bucket:${Math.floor(Date.now() / 600_000)}`
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
      return_url: `${getAppUrl()}/dashboard`,
    }, {
      idempotencyKey: createHash('sha256')
        .update(`${user.id}:${requestedPlan}:${planIdempotencySeed}`)
        .digest('hex'),
    })

    const checkoutUrl = (session as any).checkout_url ?? (session as any).url

    if (!checkoutUrl) {
      console.error('[billing/checkout] Dodo session did not include a checkout URL')
      return NextResponse.json({ error: 'checkout_url_not_found' }, { status: 500 })
    }

    return NextResponse.json({ url: checkoutUrl })

  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[billing/checkout] Error:', error)
    const errObj = error as Record<string, any>
    if (errObj?.status === 401 || errObj?.statusCode === 401 || String(errObj?.message).includes('401')) {
      return NextResponse.json({ error: 'billing_provider_unauthorized' }, { status: 502 })
    }
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
  }
}

