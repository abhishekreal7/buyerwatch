export type PlanTier = 'free' | 'starter' | 'pro' | 'growth'
export type MonitoringPlatform = 'reddit' | 'bluesky' | 'x'

/**
 * The canonical BuyerWatch tier contract. Product copy, UI affordances and
 * server-side enforcement must be derived from this object; do not add a
 * plan-specific boolean somewhere else.
 */
export const PLAN_ENTITLEMENTS = {
  free: {
    keywords: 1, monitoredTargets: 1, threadsPerMonth: 50, aiDraftsPerMonth: 10,
    pollingIntervalMinutes: 60, monitoringPlatforms: ['reddit', 'bluesky'],
    autoSend: false, slackNotifications: false, replyAttribution: false,
    trustAnalytics: false, xDailySpendLimitCents: 0, workspaces: 1,
  },
  starter: {
    keywords: 5, monitoredTargets: 2, threadsPerMonth: 250, aiDraftsPerMonth: 30,
    pollingIntervalMinutes: 60, monitoringPlatforms: ['reddit', 'bluesky'],
    autoSend: false, slackNotifications: false, replyAttribution: false,
    trustAnalytics: false, xDailySpendLimitCents: 0, workspaces: 1,
  },
  pro: {
    keywords: 10, monitoredTargets: 3, threadsPerMonth: 1000, aiDraftsPerMonth: 200,
    pollingIntervalMinutes: 5, monitoringPlatforms: ['reddit', 'bluesky', 'x'],
    autoSend: true, slackNotifications: true, replyAttribution: true,
    trustAnalytics: true, xDailySpendLimitCents: 25, workspaces: 1,
  },
  growth: {
    keywords: 50, monitoredTargets: 6, threadsPerMonth: 5000, aiDraftsPerMonth: 750,
    pollingIntervalMinutes: 5, monitoringPlatforms: ['reddit', 'bluesky', 'x'],
    autoSend: true, slackNotifications: true, replyAttribution: true,
    trustAnalytics: true, xDailySpendLimitCents: 75, workspaces: 1,
  },
} as const satisfies Record<PlanTier, {
  keywords: number
  monitoredTargets: number
  threadsPerMonth: number
  aiDraftsPerMonth: number
  pollingIntervalMinutes: number
  monitoringPlatforms: readonly MonitoringPlatform[]
  autoSend: boolean
  slackNotifications: boolean
  replyAttribution: boolean
  trustAnalytics: boolean
  xDailySpendLimitCents: number
  workspaces: number
}>

// Compatibility export for existing call sites. New code should use the
// entitlements name so its purpose is clear.
export const PLAN_LIMITS = PLAN_ENTITLEMENTS

export const PLAN_POLL_INTERVAL_MINUTES: Record<PlanTier, number> = {
  free: PLAN_ENTITLEMENTS.free.pollingIntervalMinutes,
  starter: PLAN_ENTITLEMENTS.starter.pollingIntervalMinutes,
  pro: PLAN_ENTITLEMENTS.pro.pollingIntervalMinutes,
  growth: PLAN_ENTITLEMENTS.growth.pollingIntervalMinutes,
}

export const X_DAILY_SPEND_LIMIT_CENTS: Record<PlanTier, number> = {
  free: PLAN_ENTITLEMENTS.free.xDailySpendLimitCents,
  starter: PLAN_ENTITLEMENTS.starter.xDailySpendLimitCents,
  pro: PLAN_ENTITLEMENTS.pro.xDailySpendLimitCents,
  growth: PLAN_ENTITLEMENTS.growth.xDailySpendLimitCents,
}

export const PLAN_INTENT_DAILY_LIMITS: Record<PlanTier, number> = {
  free: 50, starter: 250, pro: 500, growth: 2000,
}

/** Normalize any stored plan string to a supported tier. Unknown/legacy tiers fall back to free. */
export function normalizePlan(plan: string | null | undefined): PlanTier {
  if (plan === 'starter') return 'starter'
  if (plan === 'pro') return 'pro'
  if (plan === 'growth') return 'growth'
  return 'free'
}

export function getPlanLimits(plan: string | null | undefined) {
  return PLAN_ENTITLEMENTS[normalizePlan(plan)]
}

export function canMonitorPlatform(
  plan: string | null | undefined,
  platform: string,
): platform is MonitoringPlatform {
  return (PLAN_ENTITLEMENTS[normalizePlan(plan)].monitoringPlatforms as readonly string[])
    .includes(platform)
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
