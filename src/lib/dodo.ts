import {
  getDefaultBillingAddonPack,
  type BillingAddonPackId,
  type BillingAddonType,
} from './billing-addons'
import { appliesStarterPromotion } from './starter-promotion'

export type DodoEnvironment = 'test_mode' | 'live_mode'

export type BillingPlan = 'starter' | 'pro' | 'growth'
export type BillingCadence = 'monthly' | 'annual'

/** The card-required trial is a monthly Starter acquisition offer. */
export const STARTER_TRIAL_DAYS = 7

export function getTrialDaysForPlan(
  plan: BillingPlan,
  cadence: BillingCadence = 'monthly',
  now: Date = new Date(),
): number | undefined {
  if (appliesStarterPromotion(plan, cadence, now)) return undefined
  return plan === 'starter' && cadence === 'monthly' ? STARTER_TRIAL_DAYS : undefined
}

export type BillingPlanChangeStrategy = {
  effectiveAt: 'immediately' | 'next_billing_date'
  prorationBillingMode: 'prorated_immediately' | 'do_not_bill'
  direction: 'upgrade' | 'downgrade' | 'cadence_change'
}

export type BillingCheckoutIntent =
  | { kind: 'plan'; plan: BillingPlan; cadence: BillingCadence }
  | { kind: 'addon'; addon: BillingAddonType; pack: BillingAddonPackId }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeBillingPlan(value: unknown): BillingPlan | null {
  return value === 'starter' || value === 'pro' || value === 'growth' ? value : null
}

export function normalizeBillingCadence(value: unknown): BillingCadence | null {
  return value === 'monthly' || value === 'annual' ? value : null
}

export function getDodoProductIdForPlan(
  plan: BillingPlan,
  cadence: BillingCadence = 'monthly',
): string | undefined {
  if (cadence === 'annual') {
    if (plan === 'starter') return process.env.DODO_PAYMENTS_STARTER_ANNUAL_PRODUCT_ID
    if (plan === 'growth') return process.env.DODO_PAYMENTS_GROWTH_ANNUAL_PRODUCT_ID
    return process.env.DODO_PAYMENTS_PRO_ANNUAL_PRODUCT_ID
  }
  if (plan === 'starter') return process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID
  if (plan === 'growth') return process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID
  return process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
}

export function getDodoBillingSelectionFromProductId(
  productId: string,
): { plan: BillingPlan; cadence: BillingCadence } | null {
  const plans: BillingPlan[] = ['starter', 'pro', 'growth']
  const cadences: BillingCadence[] = ['monthly', 'annual']
  for (const plan of plans) {
    for (const cadence of cadences) {
      if (getDodoProductIdForPlan(plan, cadence) === productId) return { plan, cadence }
    }
  }
  return null
}

export function getDodoPlanFromProductId(productId: string): BillingPlan | null {
  return getDodoBillingSelectionFromProductId(productId)?.plan ?? null
}

export function getBillingPlanChangeStrategy(
  currentPlan: BillingPlan,
  requestedPlan: BillingPlan,
  currentCadence: BillingCadence = 'monthly',
  requestedCadence: BillingCadence = 'monthly',
): BillingPlanChangeStrategy | null {
  if (currentPlan === requestedPlan && currentCadence === requestedCadence) return null
  if (currentPlan === requestedPlan) {
    return {
      direction: 'cadence_change',
      effectiveAt: 'next_billing_date',
      prorationBillingMode: 'do_not_bill',
    }
  }
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
    const addon = body.addon === 'signals' || body.addon === 'drafts' ? body.addon : null
    if (!addon) return null

    // An omitted pack preserves older client behavior by selecting the entry
    // pack. A provided pack must be one of the server-owned pack IDs and must
    // belong to the requested add-on family.
    const defaultPack = getDefaultBillingAddonPack(addon)
    const pack = typeof body.addonPack === 'string' ? body.addonPack : defaultPack.id
    if (!['signals_20', 'signals_50', 'signals_120', 'drafts_5', 'drafts_12', 'drafts_30'].includes(pack)) {
      return null
    }
    const packId = pack as BillingAddonPackId
    if (!packId.startsWith(`${addon}_`)) return null
    return { kind: 'addon', addon, pack: packId }
  }

  if (!hasPlan) return { kind: 'plan', plan: 'pro', cadence: 'monthly' }
  const plan = normalizeBillingPlan(body.plan)
  const cadence = body.billing === undefined
    ? 'monthly'
    : normalizeBillingCadence(body.billing)
  return plan && cadence ? { kind: 'plan', plan, cadence } : null
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

/**
 * Dodo retains the current subscription benefits while a change is scheduled
 * for the next billing date. Do not revoke access from a plan-change webhook
 * until the subsequent event reflects the newly active product.
 */
export function hasPendingDodoScheduledChange(data: unknown): boolean {
  return isRecord(data) && data.scheduled_change != null
}
