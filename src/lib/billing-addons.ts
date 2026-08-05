import { getPlanLimits, type PlanTier } from './plan-limits'

export type BillingAddonType = 'signals' | 'drafts'

export type MonthlyAddonCredits = {
  signals: number
  drafts: number
}

export const BILLING_ADDONS = {
  signals: {
    type: 'signals',
    credits: 100,
    priceLabel: '$5',
    ctaLabel: '+100 signals for $5',
    description: 'Adds 100 extra monitored signals for the current month.',
  },
  drafts: {
    type: 'drafts',
    credits: 20,
    priceLabel: '$5',
    ctaLabel: '+20 drafts for $5',
    description: 'Adds 20 extra AI drafts for the current month.',
  },
} as const satisfies Record<BillingAddonType, {
  type: BillingAddonType
  credits: number
  priceLabel: string
  ctaLabel: string
  description: string
}>

export function getCurrentUsageMonth(now = new Date()): string {
  return `${now.toISOString().slice(0, 7)}-01`
}

export function emptyMonthlyAddonCredits(): MonthlyAddonCredits {
  return { signals: 0, drafts: 0 }
}

export function sumMonthlyAddonCredits(
  rows: Array<{ addon_type: string | null; credits: number | null }> | null | undefined,
): MonthlyAddonCredits {
  const credits = emptyMonthlyAddonCredits()
  for (const row of rows ?? []) {
    if (row.addon_type === 'signals') credits.signals += Math.max(0, Number(row.credits) || 0)
    if (row.addon_type === 'drafts') credits.drafts += Math.max(0, Number(row.credits) || 0)
  }
  return credits
}

export function getPlanLimitsWithAddons(
  plan: PlanTier,
  addonCredits: MonthlyAddonCredits,
) {
  const base = getPlanLimits(plan)
  return {
    ...base,
    threadsPerMonth: base.threadsPerMonth + addonCredits.signals,
    aiDraftsPerMonth: base.aiDraftsPerMonth + addonCredits.drafts,
  }
}

