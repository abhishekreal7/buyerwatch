import { afterEach, describe, expect, it, vi } from 'vitest'
import { scoreIntent } from '../src/lib/intent-scorer'
import { getIntentAiPreflightThreshold } from '../src/lib/intent-preflight'
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
  it('accepts the documented fractional AI preflight threshold', () => {
    vi.stubEnv('INTENT_AI_PREFLIGHT_THRESHOLD', '0.55')
    expect(getIntentAiPreflightThreshold()).toBe(55)

    vi.stubEnv('INTENT_AI_PREFLIGHT_THRESHOLD', '60')
    expect(getIntentAiPreflightThreshold()).toBe(60)

    vi.stubEnv('INTENT_AI_PREFLIGHT_THRESHOLD', '')
    expect(getIntentAiPreflightThreshold()).toBe(55)
  })

  it('keeps development mock scoring deterministic instead of random', async () => {
    vi.stubEnv('USE_MOCK_DRAFTS', 'true')

    const input = post('I am looking for an alternative to SignalCo. How much is it per month?')
    const first = await scoreIntent(input, profile)
    const second = await scoreIntent(input, profile)

    expect(second).toEqual(first)
    expect(first.score).toBeGreaterThanOrEqual(80)
    expect(first.reasoning).toContain('Development mock used deterministic scoring')
  })

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

  it('preserves matched keyword context through the provider-free entry point', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('USE_MOCK_DRAFTS', 'false')

    const input = post(
      'Curious what everyone thinks about lead generation. There is no single right answer.',
      'Is lead generation changing?',
    )
    const withoutRule = await scoreIntent(input, profile)
    const withRule = await scoreIntent(input, profile, { keywordTerm: 'lead generation' })

    expect(withoutRule.score).toBe(0)
    expect(withRule.score).toBe(38)
    expect(withRule.label).toBe('other')
  })
})
