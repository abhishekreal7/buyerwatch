import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import DodoPayments from 'dodopayments'
import { createHash } from 'node:crypto'
import { getAppUrl } from '@/lib/app-url'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'
import { getBillingAddonPack } from '@/lib/billing-addons'
import { getAddonProductId } from '@/lib/billing-addons-server'
import {
  getBillingPlanChangeStrategy,
  getDodoBillingSelectionFromProductId,
  getDodoEnvironment,
  getDodoProductIdForPlan,
  getTrialDaysForPlan,
  parseBillingCheckoutIntent,
} from '@/lib/dodo'
import { logger } from '@/lib/logger'
import { getStarterPromotionDiscountCode } from '@/lib/starter-promotion'

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
    if (!isTrustedSameOriginMutation(req)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

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
      logger.error({ code: 'invalid_dodo_environment' }, 'Billing checkout configuration is invalid')
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
        logger.error({ code: 'missing_addon_checkout_url' }, 'Billing provider response was incomplete')
        return NextResponse.json({ error: 'checkout_url_not_found' }, { status: 500 })
      }

      return NextResponse.json({ url: checkoutUrl })
    }

    const requestedPlan = intent.plan
    const requestedCadence = intent.cadence
    const starterPromotionCode = getStarterPromotionDiscountCode(
      requestedPlan,
      requestedCadence,
    )
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
      logger.error({ code: profileError.code }, 'Could not load billing profile')
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
      // Dodo applies this to the subscription itself, overriding any product
      // default. Every new plan and cadence receives the same card-required
      // acquisition trial before its selected billing cycle begins.
      subscription_data: {
        trial_period_days: getTrialDaysForPlan(requestedPlan, requestedCadence) ?? null,
      },
      // The introductory Starter price is provider-enforced for the first paid
      // cycle, after the card-required seven-day trial completes.
      discount_code: starterPromotionCode ?? null,
      feature_flags: {
        // Dodo rejects a pre-applied discount when this flag is false. Keep
        // manual code entry disabled for regular checkouts, but allow the
        // provider to accept BuyerWatch's server-selected Starter promotion.
        allow_discount_code: Boolean(starterPromotionCode),
      },
      // metadata is returned verbatim in every webhook event —
      // the webhook handler reads metadata.user_id and metadata.plan
      metadata: {
        user_id: user.id,
        plan: requestedPlan,
        billing_cadence: requestedCadence,
        trial_days: String(getTrialDaysForPlan(requestedPlan, requestedCadence) ?? 0),
        starter_promotion: starterPromotionCode ? 'first_month_19' : 'none',
      },
      return_url: `${getAppUrl()}/dashboard?billing=checkout_return&plan=${requestedPlan}`,
    }, { idempotencyKey })

    const checkoutUrl = (session as any).checkout_url ?? (session as any).url

    if (!checkoutUrl) {
      logger.error({ code: 'missing_plan_checkout_url' }, 'Billing provider response was incomplete')
      return NextResponse.json({ error: 'checkout_url_not_found' }, { status: 500 })
    }

    logger.info({
      userId: user.id,
      plan: requestedPlan,
      cadence: requestedCadence,
      trialDays: getTrialDaysForPlan(requestedPlan, requestedCadence) ?? 0,
    }, 'Billing checkout created')
    return NextResponse.json({ url: checkoutUrl })

  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const errObj = error && typeof error === 'object'
      ? error as Record<string, unknown>
      : {}
    const providerStatus = typeof errObj.status === 'number'
      ? errObj.status
      : typeof errObj.statusCode === 'number'
        ? errObj.statusCode
        : undefined
    const providerCode = typeof errObj.code === 'string'
      ? errObj.code.slice(0, 100)
      : error instanceof Error
        ? error.name
        : 'unknown'
    logger.error({ providerStatus, providerCode }, 'Billing checkout failed')
    if (providerStatus === 401 || String(errObj.message).includes('401')) {
      return NextResponse.json({ error: 'billing_provider_unauthorized' }, { status: 502 })
    }
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
  }
}
