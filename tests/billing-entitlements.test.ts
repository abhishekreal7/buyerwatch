import { describe, expect, it } from 'vitest'
import {
  getBillingDisplayState,
  getEntitledPlan,
  hasActiveSubscription,
} from '../src/lib/billing-entitlements'

describe('billing entitlements', () => {
  it('does not grant a paid tier from plan alone', () => {
    const profile = { plan: 'pro', billing_status: 'free', billing_subscription_id: null }
    expect(hasActiveSubscription(profile)).toBe(false)
    expect(getEntitledPlan(profile)).toBe('free')
    expect(getBillingDisplayState(profile)).toBe('trial_not_started')
  })

  it('requires both active status and a subscription identity', () => {
    expect(getEntitledPlan({ plan: 'growth', billing_status: 'active', billing_subscription_id: null })).toBe('free')
    expect(getEntitledPlan({ plan: 'growth', billing_status: 'active', billing_subscription_id: 'sub_123' })).toBe('growth')
  })

  it('fails closed when billing claims active but the stored tier is not paid', () => {
    const inconsistent = { plan: 'free', billing_status: 'active', billing_subscription_id: 'sub_123' }
    expect(hasActiveSubscription(inconsistent)).toBe(false)
    expect(getEntitledPlan(inconsistent)).toBe('free')
  })

  it('surfaces provider states that require billing attention', () => {
    expect(getBillingDisplayState({ plan: 'free', billing_status: 'on_hold', billing_subscription_id: 'sub_123' })).toBe('attention_required')
  })
})
