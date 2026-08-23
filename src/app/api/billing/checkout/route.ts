import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import DodoPayments from 'dodopayments'
import { createHash } from 'node:crypto'
import { getAppUrl } from '@/lib/app-url'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { readJsonBody, RequestInputError } from '@/lib/request'
import { getBillingAddonPack } from '@/lib/billing-addons'
import { getAddonProductId } from '@/lib/billing-addons-server'
import {
  getBillingPlanChangeStrategy,
  getDodoBillingSelectionFromProductId,
  getDodoEnvironment,
  getDodoProductIdForPlan,
  parseBillingCheckoutIntent,
} from '@/lib/dodo'

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
    if (!apiKey) {
      return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
    }
    if (!user.email) {
      return NextResponse.json({ error: 'billing_customer_email_missing' }, { status: 409 })
    }

    // Parse requested checkout intent. Add-ons are one-time purchases and do
    // not mutate the user's subscription plan.
    const body = await readJsonBody<Record<string, unknown>>(req, 1_024)
    const intent = parseBillingCheckoutIntent(body)
    if (!intent) {
      return NextResponse.json({ error: 'invalid_checkout_request' }, { status: 400 })
    }
    let environment: ReturnType<typeof getDodoEnvironment>
    try {
      environment = getDodoEnvironment()
    } catch {
      console.error('[billing/checkout] DODO_PAYMENTS_ENVIRONMENT is invalid')
      return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
    }

    const dodo = new DodoPayments({
      bearerToken: apiKey,
      environment,
      timeout: 15_000,
      maxRetries: 1,
    })

    if (intent.kind === 'addon') {
      const requestedAddon = intent.addon
      const requestedPack = intent.pack
      const productId = getAddonProductId(requestedPack)
      if (!productId) {
        return NextResponse.json({ error: 'addon_billing_not_configured' }, { status: 503 })
      }

      const addon = getBillingAddonPack(requestedPack)
      // Prefer a client-supplied key so intentional back-to-back pack purchases
      // each get a fresh checkout. Without one, use a short bucket so accidental
      // double-submits collapse but intentional repeats after ~30s still work.
      const clientIdempotencyKey = req.headers.get('idempotency-key')?.trim().slice(0, 100)
      const addonIdempotencySeed = clientIdempotencyKey
        || `bucket:${Math.floor(Date.now() / 30_000)}`
      const session = await dodo.checkoutSessions.create({
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: {
          email: user.email,
        },
        metadata: {
          user_id: user.id,
          purchase_type: 'addon',
          addon_type: requestedAddon,
          addon_pack: requestedPack,
          credits: String(addon.credits),
        },
        return_url: `${getAppUrl()}/dashboard?billing=addon`,
      }, {
        idempotencyKey: createHash('sha256')
          .update(`${user.id}:addon:${requestedPack}:${addonIdempotencySeed}`)
          .digest('hex'),
      })

      const checkoutUrl = (session as any).checkout_url ?? (session as any).url
      if (!checkoutUrl) {
        console.error('[billing/checkout] Dodo add-on session did not include a checkout URL')
        return NextResponse.json({ error: 'checkout_url_not_found' }, { status: 500 })
      }

      return NextResponse.json({ url: checkoutUrl })
    }

    const requestedPlan = intent.plan
    const requestedCadence = intent.cadence
    const productId = getDodoProductIdForPlan(requestedPlan, requestedCadence)
    if (!productId) {
      return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
    }

    const clientIdempotencyKey = req.headers.get('idempotency-key')?.trim().slice(0, 100)
    const planIdempotencySeed = clientIdempotencyKey
      || `bucket:${Math.floor(Date.now() / 600_000)}`
    const idempotencyKey = createHash('sha256')
      .update(`${user.id}:${requestedPlan}:${requestedCadence}:${planIdempotencySeed}`)
      .digest('hex')

    const { data: billingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('billing_subscription_id')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) {
      console.error('[billing/checkout] Could not load billing profile:', profileError)
      return NextResponse.json({ error: 'billing_profile_unavailable' }, { status: 503 })
    }

    if (billingProfile?.billing_subscription_id) {
      try {
        const subscription = await dodo.subscriptions.retrieve(
          billingProfile.billing_subscription_id,
        )
        if (subscription.status === 'active') {
          const currentSelection = getDodoBillingSelectionFromProductId(subscription.product_id)
          if (!currentSelection) {
            return NextResponse.json(
              { error: 'billing_subscription_product_unknown' },
              { status: 409 },
            )
          }
          const strategy = getBillingPlanChangeStrategy(
            currentSelection.plan,
            requestedPlan,
            currentSelection.cadence,
            requestedCadence,
          )
          if (!strategy) {
            return NextResponse.json({ error: 'plan_already_active' }, { status: 409 })
          }

          await dodo.subscriptions.changePlan(
            subscription.subscription_id,
            {
              product_id: productId,
              quantity: 1,
              effective_at: strategy.effectiveAt,
              proration_billing_mode: strategy.prorationBillingMode,
              on_payment_failure: 'prevent_change',
              metadata: {
                user_id: user.id,
                plan: requestedPlan,
                billing_cadence: requestedCadence,
              },
            },
            { idempotencyKey },
          )

          return NextResponse.json({
            url: `${getAppUrl()}/settings?section=plan&billing=plan_change_pending`,
            change: strategy.direction,
          })
        }

        if (subscription.status === 'pending' || subscription.status === 'on_hold') {
          return NextResponse.json(
            { error: 'billing_subscription_requires_attention' },
            { status: 409 },
          )
        }
        // Cancelled, failed, and expired subscriptions cannot be changed. A new
        // checkout is correct after those terminal states.
      } catch (error) {
        const providerError = error as { status?: number; statusCode?: number }
        const status = providerError.status ?? providerError.statusCode
        if (status !== 404) throw error
      }
    }

    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email,
      },
      // metadata is returned verbatim in every webhook event —
      // the webhook handler reads metadata.user_id and metadata.plan
      metadata: {
        user_id: user.id,
        plan: requestedPlan,
        billing_cadence: requestedCadence,
      },
      return_url: `${getAppUrl()}/dashboard`,
    }, { idempotencyKey })

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
