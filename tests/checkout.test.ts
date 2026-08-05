import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getBillingPlanChangeStrategy,
  getDodoEnvironment,
  getDodoProductId,
  parseBillingCheckoutIntent,
} from '../src/lib/dodo'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Dodo billing contracts', () => {
  it('accepts only explicit checkout intents', () => {
    expect(parseBillingCheckoutIntent({})).toEqual({ kind: 'plan', plan: 'pro' })
    expect(parseBillingCheckoutIntent({ plan: 'starter' })).toEqual({
      kind: 'plan',
      plan: 'starter',
    })
    expect(parseBillingCheckoutIntent({ addon: 'signals' })).toEqual({
      kind: 'addon',
      addon: 'signals',
    })
    expect(parseBillingCheckoutIntent({ plan: 'enterprise' })).toBeNull()
    expect(parseBillingCheckoutIntent({ addon: 'unknown' })).toBeNull()
    expect(parseBillingCheckoutIntent({ plan: 'pro', addon: 'signals' })).toBeNull()
  })

  it('extracts product IDs from subscription and one-time payment payloads', () => {
    expect(getDodoProductId({ product_id: 'pdt_subscription' })).toBe('pdt_subscription')
    expect(getDodoProductId({ product: { product_id: 'pdt_nested' } })).toBe('pdt_nested')
    expect(getDodoProductId({
      product_cart: [{ product_id: 'pdt_addon', quantity: 1 }],
    })).toBe('pdt_addon')
    expect(getDodoProductId({
      product_cart: [{ product_id: 'first' }, { product_id: 'second' }],
    })).toBeNull()
  })

  it('fails closed instead of silently selecting live mode', () => {
    vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', 'test_mode')
    expect(getDodoEnvironment()).toBe('test_mode')
    vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', 'live_mode')
    expect(getDodoEnvironment()).toBe('live_mode')
    vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', 'production')
    expect(() => getDodoEnvironment()).toThrow(/test_mode or live_mode/)
  })

  it('prorates upgrades now and schedules downgrades without a second subscription', () => {
    expect(getBillingPlanChangeStrategy('starter', 'growth')).toEqual({
      direction: 'upgrade',
      effectiveAt: 'immediately',
      prorationBillingMode: 'prorated_immediately',
    })
    expect(getBillingPlanChangeStrategy('growth', 'pro')).toEqual({
      direction: 'downgrade',
      effectiveAt: 'next_billing_date',
      prorationBillingMode: 'do_not_bill',
    })
    expect(getBillingPlanChangeStrategy('pro', 'pro')).toBeNull()
  })
})
