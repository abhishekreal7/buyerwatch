import { afterEach, describe, expect, it, vi } from 'vitest'
import { scoreIntent } from '../src/lib/intent-scorer'
import type { NormalizedPost } from '../src/lib/types'

const profile = {
  business_name: 'BuyerWatch',
  business_description: 'Find high-intent social conversations.',
  competitors: ['SignalCo'],
}

function post(text: string, title = 'Need a recommendation'): NormalizedPost {
  return {
    platform: 'reddit',
    externalId: 'fallback-post',
    author: 'founder',
    title,
    text,
    url: 'https://reddit.com/r/SaaS/comments/fallback-post',
    createdAt: '2026-08-01T12:00:00.000Z',
    sourceTarget: 'saas',
  }
}

afterEach(() => vi.unstubAllEnvs())

describe('intent scoring without a paid provider', () => {
  it('keeps explicit purchase and seeking signals actionable', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('USE_MOCK_DRAFTS', 'false')

    const result = await scoreIntent(
      post('I am looking for an alternative to SignalCo. How much is it per month?'),
      profile,
    )

    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.label).toBe('buying')
    expect(result.flag).toBe('COMPETITOR_RISK')
    expect(result.usage.estimatedCostMicrousd).toBe(0)
  })

  it('does not inflate weak discussion into a lead', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '# TODO: add key')
    vi.stubEnv('USE_MOCK_DRAFTS', 'false')

    const result = await scoreIntent(
      post('Sharing a few general observations from this week.', 'Weekly notes'),
      profile,
    )

    expect(result.score).toBeLessThan(60)
    expect(result.label).toBe('other')
    expect(result.usage.estimatedCostMicrousd).toBe(0)
  })
})
