"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedditDiscoveryCapacity = getRedditDiscoveryCapacity;
const env_1 = require("./env");
const redditapis_client_1 = require("./redditapis-client");
const redis_1 = require("./redis");
const redditapis_balance_state_1 = require("./redditapis-balance-state");
/**
 * Decide whether discovery may use the paid Reddit provider without spending
 * a request. When the shared read budget is spent (or its safety guard is
 * unavailable), callers deliberately use the bounded RSS fallback instead of
 * repeatedly attempting a paid-provider request that cannot run.
 */
async function getRedditDiscoveryCapacity() {
    if ((0, env_1.getRedditDiscoveryProviderKind)() !== 'redditapis') {
        return { mode: 'auto', reason: null, readBudget: null };
    }
    try {
        const [budget, balanceState] = await Promise.all([
            (0, redditapis_client_1.getRedditApisDailyBudgetStatus)(),
            redis_1.redis.get(redditapis_balance_state_1.REDDITAPIS_BALANCE_STATE_KEY),
        ]);
        const remaining = Math.max(0, budget.read.limit - budget.read.used);
        if (balanceState === 'depleted') {
            return {
                mode: 'rss_only',
                reason: 'provider_balance_depleted',
                readBudget: { ...budget.read, remaining },
            };
        }
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
            };
    }
    catch {
        // Failing open would bypass the shared paid-call guard during a Redis
        // incident. RSS is best-effort, but it is the safe degraded path.
        return {
            mode: 'rss_only',
            reason: 'provider_budget_guard_unavailable',
            readBudget: null,
        };
    }
}
