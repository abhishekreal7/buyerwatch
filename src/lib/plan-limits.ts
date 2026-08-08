export const X_DAILY_SPEND_LIMIT_CENTS: Record<string, number> = {
  free: 0,
  starter: 0,
  pro: 0,
  growth: 0,
}

export const PLAN_POLL_INTERVAL_MINUTES: Record<PlanTier, number> = {
  free: 60,
  starter: 60,
  pro: 5,
  growth: 5,
}

export const PLAN_LIMITS = {
  free: {
    keywords: 1,            // Free workspace for evaluating the workflow.
    threadsPerMonth: 50,
    aiDraftsPerMonth: 10,
    subredditTargeting: false,
    workspaces: 1,
    autoSend: false,
  },
  starter: {
    keywords: 5,            // Starter paid plan ($19/mo).
    threadsPerMonth: 250,   // Up to 250 signals/mo discovered.
    aiDraftsPerMonth: 40,   // Cost backstop for the entry plan.
    subredditTargeting: false,
    workspaces: 1,
    autoSend: false,
  },
  pro: {
    keywords: 10,           // Professional plan includes 10 keyword rules.
    threadsPerMonth: 1000,  // Up to 1,000 signals/mo
    aiDraftsPerMonth: 400,  // Effectively invisible for normal usage
    subredditTargeting: true,
    workspaces: 1,
    autoSend: true,
  },
  growth: {
    keywords: 50,           // Growth plan includes 50 keyword rules.
    threadsPerMonth: 5000,
    aiDraftsPerMonth: 2000,
    subredditTargeting: true,
    workspaces: 1,
    autoSend: true,
  },
} as const

export type PlanTier = keyof typeof PLAN_LIMITS

export const PLAN_INTENT_DAILY_LIMITS: Record<PlanTier, number> = {
  free: 50,
  starter: 250,
  pro: 500,
  growth: 2000,
}

/** Normalize any stored plan string to a supported tier. Unknown/legacy tiers fall back to free. */
export function normalizePlan(plan: string | null | undefined): PlanTier {
  if (plan === 'starter') return 'starter'
  if (plan === 'pro') return 'pro'
  if (plan === 'growth') return 'growth'
  return 'free'
}

export function getPlanLimits(plan: string | null | undefined) {
  return PLAN_LIMITS[normalizePlan(plan)]
}

export function getIntentDailyLimit(plan: string | null | undefined): number {
  return PLAN_INTENT_DAILY_LIMITS[normalizePlan(plan)]
}

/** Returns true if the plan is any paid tier. */
export function isPaidPlan(plan: string | null | undefined): boolean {
  const tier = normalizePlan(plan)
  return tier === 'starter' || tier === 'pro' || tier === 'growth'
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
