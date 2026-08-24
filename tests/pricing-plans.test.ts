import { describe, expect, it } from 'vitest'
import { PRICING_PLANS } from '../src/lib/pricing-plans'
import { getTrialDaysForPlan, STARTER_TRIAL_DAYS } from '../src/lib/dodo'
import { getIntentDailyLimit, PLAN_LIMITS } from '../src/lib/plan-limits'
import { afterAuthenticationDestination } from '../src/lib/billing-selection'

describe('pricing plan promises', () => {
  it('gives every billing tier an explicit daily intent-scoring allowance', () => {
    expect(getIntentDailyLimit('free')).toBe(50)
    expect(getIntentDailyLimit('starter')).toBe(250)
    expect(getIntentDailyLimit('pro')).toBe(500)
    expect(getIntentDailyLimit('growth')).toBe(2000)
    expect(getIntentDailyLimit('unknown')).toBe(50)
  })

  it('keeps Growth at $249 with the five-minute cadence', () => {
    const growth = PRICING_PLANS.find(plan => plan.id === 'growth')

    expect(growth?.price).toBe('$249')
    expect(growth?.period).toBe('/month')
    expect(growth?.features).toContain('5-minute polling cadence')
    expect(growth?.features).not.toContain('15-minute polling cadence')
  })

  it('offers the seven-day trial only on Starter', () => {
    const starter = PRICING_PLANS.find(plan => plan.id === 'starter')

    expect(starter?.price).toBe('$39')
    expect(starter?.cta).toBe('Start 7-day free trial')
    expect(starter?.features).toContain('7-day free trial')
    expect(STARTER_TRIAL_DAYS).toBe(7)
    expect(getTrialDaysForPlan('starter')).toBe(7)
    expect(getTrialDaysForPlan('pro')).toBeUndefined()
    expect(getTrialDaysForPlan('growth')).toBeUndefined()
  })

  it('includes X only from Professional onward', () => {
    const professional = PRICING_PLANS.find(plan => plan.id === 'pro')
    const starter = PRICING_PLANS.find(plan => plan.id === 'starter')

    expect(professional?.features).toContain('X monitoring')
    expect(starter?.features).not.toContain('X monitoring')
  })

  it('gives Starter a meaningful entitlement increase over Free', () => {
    expect(PLAN_LIMITS.free).toMatchObject({
      keywords: 1,
      threadsPerMonth: 50,
      aiDraftsPerMonth: 10,
      autoSend: false,
    })
    expect(PLAN_LIMITS.starter).toMatchObject({
      keywords: 5,
      threadsPerMonth: 250,
      aiDraftsPerMonth: 30,
      monitoredTargets: 2,
      autoSend: false,
    })
  })

  it('preserves a selected tier through authentication and onboarding', () => {
    expect(afterAuthenticationDestination('growth', false)).toBe('/onboarding?plan=growth')
    expect(afterAuthenticationDestination('growth', false, 'annual')).toBe('/onboarding?plan=growth&billing=annual')
    expect(afterAuthenticationDestination('growth', true)).toBe('/settings?section=plan&upgrade=growth&billing=monthly')
    expect(afterAuthenticationDestination('growth', true, 'annual')).toBe('/settings?section=plan&upgrade=growth&billing=annual')
    expect(afterAuthenticationDestination('enterprise', true)).toBe('/dashboard')
    expect(PRICING_PLANS.map(plan => plan.href)).toEqual([
      '/signup?plan=starter&billing=monthly',
      '/signup?plan=pro&billing=monthly',
      '/signup?plan=growth&billing=monthly',
    ])
  })

  it('publishes exact annual charges and monthly equivalents', () => {
    expect(PRICING_PLANS.map(({ id, annualPrice, annualTotal }) => ({ id, annualPrice, annualTotal }))).toEqual([
      { id: 'starter', annualPrice: '$31', annualTotal: '$372' },
      { id: 'pro', annualPrice: '$79', annualTotal: '$948' },
      { id: 'growth', annualPrice: '$199', annualTotal: '$2,388' },
    ])
  })
})
