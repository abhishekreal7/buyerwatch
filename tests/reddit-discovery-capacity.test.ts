import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRedditDiscoveryCapacity } from '../src/lib/reddit-discovery-capacity'
import { redis } from '../src/lib/redis'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Reddit discovery capacity', () => {
  it('keeps using the managed provider while shared read capacity remains', async () => {
    vi.stubEnv('REDDITAPIS_API_KEY', 'provider-key')
    vi.stubEnv('REDDITAPIS_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_BUDGET_GUARD_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_MAX_DAILY_READ_CALLS', '10')
    vi.spyOn(redis, 'mget').mockResolvedValue(['7', '0'] as never)

    await expect(getRedditDiscoveryCapacity()).resolves.toEqual({
      mode: 'auto',
      reason: null,
      readBudget: { used: 7, limit: 10, remaining: 3 },
    })
  })

  it('switches safely to RSS after the shared paid-read budget is exhausted', async () => {
    vi.stubEnv('REDDITAPIS_API_KEY', 'provider-key')
    vi.stubEnv('REDDITAPIS_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_BUDGET_GUARD_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_MAX_DAILY_READ_CALLS', '10')
    vi.spyOn(redis, 'mget').mockResolvedValue(['10', '0'] as never)

    await expect(getRedditDiscoveryCapacity()).resolves.toEqual({
      mode: 'rss_only',
      reason: 'provider_budget_exhausted',
      readBudget: { used: 10, limit: 10, remaining: 0 },
    })
  })

  it('fails closed to RSS when the paid-call safety guard cannot be read', async () => {
    vi.stubEnv('REDDITAPIS_API_KEY', 'provider-key')
    vi.stubEnv('REDDITAPIS_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_BUDGET_GUARD_ENABLED', 'true')
    vi.spyOn(redis, 'mget').mockRejectedValue(new Error('redis unavailable'))

    await expect(getRedditDiscoveryCapacity()).resolves.toEqual({
      mode: 'rss_only',
      reason: 'provider_budget_guard_unavailable',
      readBudget: null,
    })
  })
})
