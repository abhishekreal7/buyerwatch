import type { BillingCadence, BillingPlan } from './dodo'

export const STARTER_PROMOTION = {
  code: 'START19',
  standardMonthlyPriceUsd: 39,
  introductoryMonthlyPriceUsd: 19,
  endsAt: '2026-09-15T23:59:59.000Z',
  subscriptionCycles: 1,
  redemptionLimit: 50,
} as const

export function isStarterPromotionActive(now: Date = new Date()): boolean {
  return now.getTime() <= Date.parse(STARTER_PROMOTION.endsAt)
}

export function appliesStarterPromotion(
  plan: BillingPlan,
  cadence: BillingCadence,
  now: Date = new Date(),
): boolean {
  return plan === 'starter' && cadence === 'monthly' && isStarterPromotionActive(now)
}

export function getStarterPromotionDiscountCode(
  plan: BillingPlan,
  cadence: BillingCadence,
  now: Date = new Date(),
): string | undefined {
  return appliesStarterPromotion(plan, cadence, now)
    ? STARTER_PROMOTION.code
    : undefined
}
