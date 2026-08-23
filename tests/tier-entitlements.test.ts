import { describe, expect, it } from 'vitest'
import {
  canMonitorPlatform,
  getPlanLimits,
  isPollingDue,
} from '../src/lib/plan-limits'
import { getBillingPlanChangeStrategy, hasPendingDodoScheduledChange } from '../src/lib/dodo'

describe('tier entitlement contract', () => {
  it.each([
    ['starter', 5, 2, 250, 30, false],
    ['pro', 10, 3, 1000, 200, true],
    ['growth', 50, 6, 5000, 750, true],
  ] as const)('enforces the promised %s capacity', (plan, rules, targets, signals, drafts, autoSend) => {
    expect(getPlanLimits(plan)).toMatchObject({
      keywords: rules,
      monitoredTargets: targets,
      threadsPerMonth: signals,
      aiDraftsPerMonth: drafts,
      autoSend,
    })
  })

  it('gives X only to Professional and Growth', () => {
    expect(canMonitorPlatform('starter', 'x')).toBe(false)
    expect(canMonitorPlatform('pro', 'x')).toBe(true)
    expect(canMonitorPlatform('growth', 'x')).toBe(true)
  })

  it('keeps Starter on the 60-minute cadence and paid higher tiers on 5 minutes', () => {
    const checkedAt = new Date('2026-08-23T12:00:00.000Z').toISOString()
    expect(isPollingDue('starter', checkedAt, Date.parse('2026-08-23T12:05:00.000Z'))).toBe(false)
    expect(isPollingDue('pro', checkedAt, Date.parse('2026-08-23T12:05:00.000Z'))).toBe(true)
    expect(isPollingDue('growth', checkedAt, Date.parse('2026-08-23T12:05:00.000Z'))).toBe(true)
  })

  it('applies upgrades immediately and keeps scheduled downgrades on the current plan until Dodo changes it', () => {
    expect(getBillingPlanChangeStrategy('starter', 'pro')).toMatchObject({
      direction: 'upgrade', effectiveAt: 'immediately', prorationBillingMode: 'prorated_immediately',
    })
    expect(getBillingPlanChangeStrategy('growth', 'pro')).toMatchObject({
      direction: 'downgrade', effectiveAt: 'next_billing_date', prorationBillingMode: 'do_not_bill',
    })
  })

  it('recognizes Dodo scheduled changes so a downgrade cannot revoke access early', () => {
    expect(hasPendingDodoScheduledChange({ scheduled_change: { effective_at: 'next_billing_date' } })).toBe(true)
    expect(hasPendingDodoScheduledChange({ scheduled_change: null })).toBe(false)
    expect(hasPendingDodoScheduledChange({})).toBe(false)
  })
})
