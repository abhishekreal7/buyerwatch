"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_LIMITS = exports.X_DAILY_SPEND_LIMIT_CENTS = void 0;
exports.normalizePlan = normalizePlan;
exports.getPlanLimits = getPlanLimits;
exports.isPaidPlan = isPaidPlan;
exports.X_DAILY_SPEND_LIMIT_CENTS = {
    free: 0,
    pro: 0,
    growth: 0,
};
exports.PLAN_LIMITS = {
    free: {
        keywords: 1, // Primary felt constraint — 1 keyword rule
        threadsPerMonth: 50, // Up to 50 signals/mo discovered
        aiDraftsPerMonth: 40, // Generous cost backstop — should rarely bind on 1 keyword
        subredditTargeting: false,
        workspaces: 1,
        autoSend: false,
    },
    pro: {
        keywords: 10, // Primary felt constraint — 10 keyword rules
        threadsPerMonth: 1000, // Up to 1,000 signals/mo
        aiDraftsPerMonth: 400, // Effectively invisible for normal usage
        subredditTargeting: true,
        workspaces: 1,
        autoSend: true,
    },
    growth: {
        keywords: 50, // Primary felt constraint — 50 keyword rules
        threadsPerMonth: 5000,
        aiDraftsPerMonth: 2000,
        subredditTargeting: true,
        workspaces: 1,
        autoSend: true,
    },
};
/** Normalize any stored plan string to free | pro | growth. Unknown/legacy tiers → free. */
function normalizePlan(plan) {
    if (plan === 'pro')
        return 'pro';
    if (plan === 'growth')
        return 'growth';
    return 'free';
}
function getPlanLimits(plan) {
    return exports.PLAN_LIMITS[normalizePlan(plan)];
}
/** Returns true if the plan is any paid tier (pro or growth). */
function isPaidPlan(plan) {
    return normalizePlan(plan) !== 'free';
}
