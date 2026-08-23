import { getPlanLimits, type PlanTier } from './plan-limits'

export type BillingAddonType = 'signals' | 'drafts'
export type BillingAddonPackId =
  | 'signals_20'
  | 'signals_50'
  | 'signals_120'
  | 'drafts_5'
  | 'drafts_12'
  | 'drafts_30'

export type BillingAddonPack = {
  id: BillingAddonPackId
  type: BillingAddonType
  credits: number
  priceUsd: number
  priceLabel: string
  ctaLabel: string
  description: string
  popular?: boolean
}

/** One-time capacity packs. IDs are stable server-side entitlement contracts. */
export const BILLING_ADDON_PACKS = {
  signals_20: {
    id: 'signals_20', type: 'signals', credits: 20, priceUsd: 5,
    priceLabel: '$5', ctaLabel: '+20 signals for $5',
    description: '20 extra monitored signals for the current month.',
  },
  signals_50: {
    id: 'signals_50', type: 'signals', credits: 50, priceUsd: 10,
    priceLabel: '$10', ctaLabel: '+50 signals for $10',
    description: '50 extra monitored signals for the current month.', popular: true,
  },
  signals_120: {
    id: 'signals_120', type: 'signals', credits: 120, priceUsd: 20,
    priceLabel: '$20', ctaLabel: '+120 signals for $20',
    description: '120 extra monitored signals for the current month.',
  },
  drafts_5: {
    id: 'drafts_5', type: 'drafts', credits: 5, priceUsd: 5,
    priceLabel: '$5', ctaLabel: '+5 AI drafts for $5',
    description: '5 extra AI drafts for the current month.',
  },
  drafts_12: {
    id: 'drafts_12', type: 'drafts', credits: 12, priceUsd: 10,
    priceLabel: '$10', ctaLabel: '+12 AI drafts for $10',
    description: '12 extra AI drafts for the current month.', popular: true,
  },
  drafts_30: {
    id: 'drafts_30', type: 'drafts', credits: 30, priceUsd: 20,
    priceLabel: '$20', ctaLabel: '+30 AI drafts for $20',
    description: '30 extra AI drafts for the current month.',
  },
} as const satisfies Record<BillingAddonPackId, BillingAddonPack>

export const BILLING_ADDON_PACK_IDS = Object.keys(BILLING_ADDON_PACKS) as BillingAddonPackId[]

export function getBillingAddonPacks(type: BillingAddonType): BillingAddonPack[] {
  return BILLING_ADDON_PACK_IDS
    .map((id) => BILLING_ADDON_PACKS[id])
    .filter((pack) => pack.type === type)
}

export function getBillingAddonPack(packId: BillingAddonPackId): BillingAddonPack {
  return BILLING_ADDON_PACKS[packId]
}

export function getDefaultBillingAddonPack(type: BillingAddonType): BillingAddonPack {
  return type === 'signals' ? BILLING_ADDON_PACKS.signals_20 : BILLING_ADDON_PACKS.drafts_5
}

// Compatibility aliases for small inline prompts; the picker provides choice.
export const BILLING_ADDONS = {
  signals: BILLING_ADDON_PACKS.signals_20,
  drafts: BILLING_ADDON_PACKS.drafts_5,
} as const

export type MonthlyAddonCredits = { signals: number; drafts: number }

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

export function getPlanLimitsWithAddons(plan: PlanTier, addonCredits: MonthlyAddonCredits) {
  const base = getPlanLimits(plan)
  return {
    ...base,
    threadsPerMonth: base.threadsPerMonth + addonCredits.signals,
    aiDraftsPerMonth: base.aiDraftsPerMonth + addonCredits.drafts,
  }
}
