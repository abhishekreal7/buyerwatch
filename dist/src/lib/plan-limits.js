"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_INTENT_DAILY_LIMITS = exports.X_DAILY_SPEND_LIMIT_CENTS = exports.PLAN_POLL_INTERVAL_MINUTES = exports.PLAN_LIMITS = exports.PLAN_ENTITLEMENTS = void 0;
exports.normalizePlan = normalizePlan;
exports.getPlanLimits = getPlanLimits;
exports.canMonitorPlatform = canMonitorPlatform;
exports.getIntentDailyLimit = getIntentDailyLimit;
exports.isPaidPlan = isPaidPlan;
exports.isPollingDue = isPollingDue;
/**
 * The canonical BuyerWatch tier contract. Product copy, UI affordances and
 * server-side enforcement must be derived from this object; do not add a
 * plan-specific boolean somewhere else.
 */
exports.PLAN_ENTITLEMENTS = {
    free: {
        keywords: 1, monitoredTargets: 1, threadsPerMonth: 50, aiDraftsPerMonth: 10,
        pollingIntervalMinutes: 60, monitoringPlatforms: ['reddit', 'bluesky'],
        autoSend: false, slackNotifications: false, replyAttribution: false,
        trustAnalytics: false, xDailySpendLimitCents: 0, workspaces: 1,
    },
    starter: {
        keywords: 5, monitoredTargets: 2, threadsPerMonth: 250, aiDraftsPerMonth: 30,
        pollingIntervalMinutes: 60, monitoringPlatforms: ['reddit', 'bluesky'],
        autoSend: true, slackNotifications: false, replyAttribution: false,
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
};
// Compatibility export for existing call sites. New code should use the
// entitlements name so its purpose is clear.
exports.PLAN_LIMITS = exports.PLAN_ENTITLEMENTS;
exports.PLAN_POLL_INTERVAL_MINUTES = {
    free: exports.PLAN_ENTITLEMENTS.free.pollingIntervalMinutes,
    starter: exports.PLAN_ENTITLEMENTS.starter.pollingIntervalMinutes,
    pro: exports.PLAN_ENTITLEMENTS.pro.pollingIntervalMinutes,
    growth: exports.PLAN_ENTITLEMENTS.growth.pollingIntervalMinutes,
};
exports.X_DAILY_SPEND_LIMIT_CENTS = {
    free: exports.PLAN_ENTITLEMENTS.free.xDailySpendLimitCents,
    starter: exports.PLAN_ENTITLEMENTS.starter.xDailySpendLimitCents,
    pro: exports.PLAN_ENTITLEMENTS.pro.xDailySpendLimitCents,
    growth: exports.PLAN_ENTITLEMENTS.growth.xDailySpendLimitCents,
};
exports.PLAN_INTENT_DAILY_LIMITS = {
    free: 50, starter: 250, pro: 500, growth: 2000,
};
/** Normalize any stored plan string to a supported tier. Unknown/legacy tiers fall back to free. */
function normalizePlan(plan) {
    if (plan === 'starter')
        return 'starter';
    if (plan === 'pro')
        return 'pro';
    if (plan === 'growth')
        return 'growth';
    return 'free';
}
function getPlanLimits(plan) {
    return exports.PLAN_ENTITLEMENTS[normalizePlan(plan)];
}
function canMonitorPlatform(plan, platform) {
    return exports.PLAN_ENTITLEMENTS[normalizePlan(plan)].monitoringPlatforms
        .includes(platform);
}
function getIntentDailyLimit(plan) {
    return exports.PLAN_INTENT_DAILY_LIMITS[normalizePlan(plan)];
}
/** Returns true if the plan is any paid tier. */
function isPaidPlan(plan) {
    const tier = normalizePlan(plan);
    return tier === 'starter' || tier === 'pro' || tier === 'growth';
}
function isPollingDue(plan, lastPolledAt, now = Date.now()) {
    if (!lastPolledAt)
        return true;
    const timestamp = Date.parse(lastPolledAt);
    if (!Number.isFinite(timestamp))
        return true;
    return now - timestamp >= exports.PLAN_POLL_INTERVAL_MINUTES[normalizePlan(plan)] * 60_000;
}
