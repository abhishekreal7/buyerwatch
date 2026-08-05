import {
  BILLING_ADDONS,
  type BillingAddonType,
} from './billing-addons'

export function getAddonProductId(type: BillingAddonType): string | undefined {
  if (type === 'signals') return process.env.DODO_PAYMENTS_SIGNAL_PACK_PRODUCT_ID
  return process.env.DODO_PAYMENTS_DRAFT_PACK_PRODUCT_ID
}

export function getAddonTypeFromProductId(productId: string | null | undefined): BillingAddonType | null {
  if (!productId) return null
  if (productId === process.env.DODO_PAYMENTS_SIGNAL_PACK_PRODUCT_ID) return 'signals'
  if (productId === process.env.DODO_PAYMENTS_DRAFT_PACK_PRODUCT_ID) return 'drafts'
  return null
}

export function normalizeAddonType(value: unknown): BillingAddonType | null {
  return value === 'signals' || value === 'drafts' ? value : null
}

export function getAddonCredits(type: BillingAddonType): number {
  return BILLING_ADDONS[type].credits
}

