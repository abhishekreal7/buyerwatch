import { describe, expect, it } from 'vitest'
import { PRICING_PLANS } from '../src/lib/pricing-plans'

describe('pricing plan promises', () => {
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
})
