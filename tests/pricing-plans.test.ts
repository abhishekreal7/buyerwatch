import { describe, expect, it } from 'vitest'
import { PRICING_PLANS } from '../src/lib/pricing-plans'
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

  it('keeps Growth at $149 with the five-minute cadence', () => {
    const growth = PRICING_PLANS.find(plan => plan.id === 'growth')

    expect(growth?.price).toBe('$149')
    expect(growth?.period).toBe('/month')
    expect(growth?.features).toContain('5-minute polling cadence')
    expect(growth?.features).not.toContain('15-minute polling cadence')
  })

  it('does not advertise X while the product supports Reddit and Bluesky', () => {
    const professional = PRICING_PLANS.find(plan => plan.id === 'pro')

    expect(professional?.features).toContain('Reddit & Bluesky monitoring')
    expect(professional?.features.some(feature => feature.includes('X monitoring'))).toBe(false)
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
      aiDraftsPerMonth: 40,
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
      { id: 'starter', annualPrice: '$15', annualTotal: '$180' },
      { id: 'pro', annualPrice: '$39', annualTotal: '$468' },
      { id: 'growth', annualPrice: '$119', annualTotal: '$1,428' },
    ])
  })
})
