export type DodoEnvironment = 'test_mode' | 'live_mode'

export type BillingPlan = 'starter' | 'pro' | 'growth'

export type BillingCheckoutIntent =
  | { kind: 'plan'; plan: BillingPlan }
  | { kind: 'addon'; addon: 'signals' | 'drafts' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
  return body.plan === 'starter' || body.plan === 'pro' || body.plan === 'growth'
    ? { kind: 'plan', plan: body.plan }
    : null
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
