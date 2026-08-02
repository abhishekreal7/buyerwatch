export const X_DAILY_SPEND_LIMIT_CENTS: Record<string, number> = {
  free: 0,
  pro: 0,
  growth: 0,
}

export const PLAN_POLL_INTERVAL_MINUTES: Record<PlanTier, number> = {
  free: 60,
  pro: 5,
  growth: 5,
}

export const PLAN_LIMITS = {
  free: {
    keywords: 1,            // Primary felt constraint — 1 keyword rule
    threadsPerMonth: 50,    // Up to 50 signals/mo discovered
    aiDraftsPerMonth: 40,   // Generous cost backstop — should rarely bind on 1 keyword
    subredditTargeting: false,
    workspaces: 1,
    autoSend: false,
  },
  pro: {
    keywords: 10,           // Primary felt constraint — 10 keyword rules
    threadsPerMonth: 1000,  // Up to 1,000 signals/mo
    aiDraftsPerMonth: 400,  // Effectively invisible for normal usage
    subredditTargeting: true,
    workspaces: 1,
    autoSend: true,
  },
  growth: {
    keywords: 50,           // Primary felt constraint — 50 keyword rules
    threadsPerMonth: 5000,
    aiDraftsPerMonth: 2000,
    subredditTargeting: true,
    workspaces: 1,
    autoSend: true,
  },
} as const

export type PlanTier = keyof typeof PLAN_LIMITS

/** Normalize any stored plan string to free | pro | growth. Unknown/legacy tiers → free. */
export function normalizePlan(plan: string | null | undefined): PlanTier {
  if (plan === 'pro') return 'pro'
  if (plan === 'growth') return 'growth'
  return 'free'
}

export function getPlanLimits(plan: string | null | undefined) {
  return PLAN_LIMITS[normalizePlan(plan)]
}

/** Returns true if the plan is any paid tier (pro or growth). */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return normalizePlan(plan) !== 'free'
}

export function isPollingDue(
  plan: string | null | undefined,
  lastPolledAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastPolledAt) return true
  const timestamp = Date.parse(lastPolledAt)
  if (!Number.isFinite(timestamp)) return true
  return now - timestamp >= PLAN_POLL_INTERVAL_MINUTES[normalizePlan(plan)] * 60_000
}
