import {
  BILLING_ADDON_PACK_IDS,
  BILLING_ADDON_PACKS,
  type BillingAddonPack,
  type BillingAddonPackId,
} from './billing-addons'

const PRODUCT_ENV_BY_PACK: Record<BillingAddonPackId, string> = {
  signals_20: 'DODO_PAYMENTS_SIGNAL_20_PRODUCT_ID',
  signals_50: 'DODO_PAYMENTS_SIGNAL_50_PRODUCT_ID',
  signals_120: 'DODO_PAYMENTS_SIGNAL_120_PRODUCT_ID',
  drafts_5: 'DODO_PAYMENTS_DRAFT_5_PRODUCT_ID',
  drafts_12: 'DODO_PAYMENTS_DRAFT_12_PRODUCT_ID',
  drafts_30: 'DODO_PAYMENTS_DRAFT_30_PRODUCT_ID',
}

export function getAddonProductId(packId: BillingAddonPackId): string | undefined {
  return process.env[PRODUCT_ENV_BY_PACK[packId]]
}

export function getAddonPackFromProductId(productId: string | null | undefined): BillingAddonPack | null {
  if (!productId) return null
  for (const packId of BILLING_ADDON_PACK_IDS) {
    if (getAddonProductId(packId) === productId) return BILLING_ADDON_PACKS[packId]
  }
  return null
}

export function normalizeAddonPackId(value: unknown): BillingAddonPackId | null {
  return typeof value === 'string' && value in BILLING_ADDON_PACKS
    ? value as BillingAddonPackId
    : null
}
