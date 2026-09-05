import { describe, expect, it } from 'vitest'
import { PRICING_PLANS } from '../src/lib/pricing-plans'
import { getTrialDaysForPlan, STARTER_TRIAL_DAYS } from '../src/lib/dodo'
import { getIntentDailyLimit, PLAN_LIMITS } from '../src/lib/plan-limits'
import { afterAuthenticationDestination, afterOnboardingDestination, selectedPlanForSignup } from '../src/lib/billing-selection'
import {
  appliesStarterPromotion,
  getStarterPromotionDiscountCode,
  STARTER_PROMOTION,
} from '../src/lib/starter-promotion'

describe('pricing plan promises', () => {
  it('gives every billing tier an explicit daily intent-scoring allowance', () => {
    expect(getIntentDailyLimit('free')).toBe(0)
    expect(getIntentDailyLimit('starter')).toBe(250)
    expect(getIntentDailyLimit('pro')).toBe(500)
    expect(getIntentDailyLimit('growth')).toBe(2000)
    expect(getIntentDailyLimit('unknown')).toBe(0)
  })

  it('keeps Growth at $249 with the five-minute cadence', () => {
    const growth = PRICING_PLANS.find(plan => plan.id === 'growth')

    expect(growth?.price).toBe('$249')
    expect(growth?.period).toBe('/month')
    expect(growth?.features).toContain('5-minute polling cadence')
    expect(growth?.features).not.toContain('15-minute polling cadence')
  })

  it('stacks the seven-day Starter trial with the introductory first-month price', () => {
    const starter = PRICING_PLANS.find(plan => plan.id === 'starter')
    const duringPromotion = new Date('2026-08-25T00:00:00.000Z')
    expect(starter?.price).toBe('$39')
    expect(starter?.cta).toBe('Start for $19')
    expect(starter?.features).toContain('Card-required 7-day free trial')
    expect(starter?.features).toContain('Up to 250 buyer-intent signals during the trial')
    expect(starter?.features).toContain('One guarded automatic reply during the trial')
    expect(STARTER_TRIAL_DAYS).toBe(7)
    expect(STARTER_PROMOTION.introductoryMonthlyPriceUsd).toBe(19)
    expect(STARTER_PROMOTION.standardMonthlyPriceUsd).toBe(39)
    expect(STARTER_PROMOTION.subscriptionCycles).toBe(1)
    expect(appliesStarterPromotion('starter', 'monthly', duringPromotion)).toBe(true)
    expect(appliesStarterPromotion('starter', 'annual', duringPromotion)).toBe(false)
    expect(getStarterPromotionDiscountCode('starter', 'monthly', duringPromotion)).toBe('START19')
    expect(getTrialDaysForPlan('starter', 'monthly')).toBe(7)
    expect(getTrialDaysForPlan('starter', 'annual')).toBe(7)
    expect(getTrialDaysForPlan('pro')).toBeUndefined()
    expect(getTrialDaysForPlan('growth')).toBeUndefined()
    expect(getTrialDaysForPlan('growth', 'annual')).toBeUndefined()
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
      aiDraftsPerMonth: 0,
      autoSend: false,
    })
    expect(PLAN_LIMITS.starter).toMatchObject({
      keywords: 5,
      threadsPerMonth: 250,
      aiDraftsPerMonth: 30,
      monitoredTargets: 2,
      autoSend: true,
    })
    expect(PRICING_PLANS.find(plan => plan.id === 'starter')?.features)
      .toContain('Guarded auto-send')
  })

  it('preserves a selected tier through authentication and onboarding', () => {
    expect(selectedPlanForSignup(null)).toBe('starter')
    expect(selectedPlanForSignup('invalid')).toBe('starter')
    expect(selectedPlanForSignup('growth')).toBe('growth')
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

  it('publishes the same monthly AI-draft allowances enforced by the backend', () => {
    const professional = PRICING_PLANS.find(plan => plan.id === 'pro')
    const growth = PRICING_PLANS.find(plan => plan.id === 'growth')

    expect(PLAN_LIMITS.pro.aiDraftsPerMonth).toBe(100)
    expect(PLAN_LIMITS.growth.aiDraftsPerMonth).toBe(500)
    expect(professional?.features).toContain('100 AI-drafted replies/month')
    expect(growth?.features).toContain('500 AI-drafted replies/month')
  })

  it('routes completed onboarding into the selected trial checkout', () => {
    expect(afterOnboardingDestination('starter', 'monthly', true)).toBe('/settings?section=plan&upgrade=starter&billing=monthly&activation=complete&scan=queued')
    expect(afterOnboardingDestination('growth', 'annual', false)).toBe('/settings?section=plan&upgrade=growth&billing=annual&activation=complete&scan=scheduled')
    expect(afterOnboardingDestination(null, undefined, true)).toBe('/opportunities?activation=complete&scan=queued')
  })

  it('publishes exact annual charges and monthly equivalents', () => {
    expect(PRICING_PLANS.map(({ id, annualPrice, annualTotal }) => ({ id, annualPrice, annualTotal }))).toEqual([
      { id: 'starter', annualPrice: '$31', annualTotal: '$372' },
      { id: 'pro', annualPrice: '$79', annualTotal: '$948' },
      { id: 'growth', annualPrice: '$199', annualTotal: '$2,388' },
    ])
  })
})
