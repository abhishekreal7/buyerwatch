import { getRedditDiscoveryProviderKind } from './env'
import { getRedditApisDailyBudgetStatus } from './redditapis-client'

export type RedditDiscoveryFetchMode = 'auto' | 'rss_only'

export type RedditDiscoveryCapacity = {
  mode: RedditDiscoveryFetchMode
  reason: 'provider_budget_exhausted' | 'provider_budget_guard_unavailable' | null
  readBudget: { used: number; limit: number; remaining: number } | null
}

/**
 * Decide whether discovery may use the paid Reddit provider without spending
 * a request. When the shared read budget is spent (or its safety guard is
 * unavailable), callers deliberately use the bounded RSS fallback instead of
 * repeatedly attempting a paid-provider request that cannot run.
 */
export async function getRedditDiscoveryCapacity(): Promise<RedditDiscoveryCapacity> {
  if (getRedditDiscoveryProviderKind() !== 'redditapis') {
    return { mode: 'auto', reason: null, readBudget: null }
  }

  try {
    const budget = await getRedditApisDailyBudgetStatus()
    const remaining = Math.max(0, budget.read.limit - budget.read.used)
    return remaining > 0
      ? {
          mode: 'auto',
          reason: null,
          readBudget: { ...budget.read, remaining },
        }
      : {
          mode: 'rss_only',
          reason: 'provider_budget_exhausted',
          readBudget: { ...budget.read, remaining: 0 },
        }
  } catch {
    // Failing open would bypass the shared paid-call guard during a Redis
    // incident. RSS is best-effort, but it is the safe degraded path.
    return {
      mode: 'rss_only',
      reason: 'provider_budget_guard_unavailable',
      readBudget: null,
    }
  }
}
