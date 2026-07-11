export const X_DAILY_SPEND_LIMIT_CENTS: Record<string, number> = {
  free: 0,
  pro: 0,
}

export const PLAN_LIMITS = {
  free: {
    keywords: 2,
    threadsPerMonth: 10,
    aiDraftsPerMonth: 5,
    subredditTargeting: false,
    workspaces: 1,
  },
  pro: {
    keywords: 20,
    threadsPerMonth: 500,
    aiDraftsPerMonth: 100,
    subredditTargeting: true,
    workspaces: 1,
  },
} as const

export type PlanTier = keyof typeof PLAN_LIMITS

/** Normalize any stored plan string to free | pro. Unknown/legacy tiers → free. */
export function normalizePlan(plan: string | null | undefined): PlanTier {
  return plan === 'pro' ? 'pro' : 'free'
}

export function getPlanLimits(plan: string | null | undefined) {
  return PLAN_LIMITS[normalizePlan(plan)]
}
