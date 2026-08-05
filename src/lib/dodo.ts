export type DodoEnvironment = 'test_mode' | 'live_mode'

export type BillingPlan = 'starter' | 'pro' | 'growth'

export type BillingPlanChangeStrategy = {
  effectiveAt: 'immediately' | 'next_billing_date'
  prorationBillingMode: 'prorated_immediately' | 'do_not_bill'
  direction: 'upgrade' | 'downgrade'
}

export type BillingCheckoutIntent =
  | { kind: 'plan'; plan: BillingPlan }
  | { kind: 'addon'; addon: 'signals' | 'drafts' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeBillingPlan(value: unknown): BillingPlan | null {
  return value === 'starter' || value === 'pro' || value === 'growth' ? value : null
}

export function getDodoProductIdForPlan(plan: BillingPlan): string | undefined {
  if (plan === 'starter') return process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID
  if (plan === 'growth') return process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID
  return process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
}

export function getDodoPlanFromProductId(productId: string): BillingPlan | null {
  const plans: BillingPlan[] = ['starter', 'pro', 'growth']
  return plans.find((plan) => getDodoProductIdForPlan(plan) === productId) ?? null
}

export function getBillingPlanChangeStrategy(
  currentPlan: BillingPlan,
  requestedPlan: BillingPlan,
): BillingPlanChangeStrategy | null {
  if (currentPlan === requestedPlan) return null
  const rank: Record<BillingPlan, number> = { starter: 0, pro: 1, growth: 2 }
  const isUpgrade = rank[requestedPlan] > rank[currentPlan]
  return isUpgrade
    ? {
        direction: 'upgrade',
        effectiveAt: 'immediately',
        prorationBillingMode: 'prorated_immediately',
      }
    : {
        direction: 'downgrade',
        effectiveAt: 'next_billing_date',
        prorationBillingMode: 'do_not_bill',
      }
}

/**
 * Billing must never fall through to live mode because of a missing or mistyped
 * environment variable.
 */
export function getDodoEnvironment(
  value = process.env.DODO_PAYMENTS_ENVIRONMENT,
): DodoEnvironment {
  if (value === 'test_mode' || value === 'live_mode') return value
  throw new Error('DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode')
}

/**
 * Parse the small, closed checkout request contract. An omitted intent keeps the
 * historic Pro default, while malformed or ambiguous input is rejected.
 */
export function parseBillingCheckoutIntent(
  body: Record<string, unknown>,
): BillingCheckoutIntent | null {
  const hasPlan = body.plan !== undefined
  const hasAddon = body.addon !== undefined

  if (hasPlan && hasAddon) return null
  if (hasAddon) {
    return body.addon === 'signals' || body.addon === 'drafts'
      ? { kind: 'addon', addon: body.addon }
      : null
  }

  if (!hasPlan) return { kind: 'plan', plan: 'pro' }
  const plan = normalizeBillingPlan(body.plan)
  return plan ? { kind: 'plan', plan } : null
}

/**
 * Subscription payloads expose product_id directly. One-time payment payloads
 * expose products through product_cart, so support both official Dodo shapes.
 */
export function getDodoProductId(data: unknown): string | null {
  if (!isRecord(data)) return null
  if (typeof data.product_id === 'string' && data.product_id) return data.product_id

  if (
    isRecord(data.product)
    && typeof data.product.product_id === 'string'
    && data.product.product_id
  ) {
    return data.product.product_id
  }

  if (!Array.isArray(data.product_cart)) return null
  const productIds = data.product_cart
    .map((item) => isRecord(item) && typeof item.product_id === 'string' ? item.product_id : null)
    .filter((productId): productId is string => Boolean(productId))

  return productIds.length === 1 ? productIds[0] : null
}
