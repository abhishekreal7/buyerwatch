"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyRedditApisBalance = classifyRedditApisBalance;
exports.runRedditApisBalanceMonitor = runRedditApisBalanceMonitor;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("./env");
const logger_1 = require("./logger");
const redis_1 = require("./redis");
const reddit_delivery_alerts_1 = require("./reddit-delivery-alerts");
const redditapis_client_1 = require("./redditapis-client");
const redditapis_balance_state_1 = require("./redditapis-balance-state");
const CHECK_LOCK_KEY = 'monitor:redditapis:balance:check:v1';
const CHECK_INTERVAL_SECONDS = 15 * 60;
const STATE_TTL_SECONDS = 90 * 24 * 60 * 60;
function configuredThreshold() {
    const parsed = Number(process.env.REDDITAPIS_LOW_BALANCE_USD?.trim());
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 1;
    return Math.min(10_000, Math.max(0.01, parsed));
}
function classifyRedditApisBalance(creditsRemaining, lowBalanceUsd = configuredThreshold()) {
    if (!Number.isFinite(creditsRemaining) || creditsRemaining < 0) {
        throw new Error('redditapis_balance_invalid');
    }
    if (creditsRemaining <= 0.05)
        return 'depleted';
    return creditsRemaining <= lowBalanceUsd ? 'low' : 'healthy';
}
function isRedditApisConfigured() {
    return (0, env_1.getRedditDiscoveryProviderKind)() === 'redditapis'
        || (0, env_1.getRedditPostingProviderKind)() === 'redditapis';
}
async function resolveRecoveredBalanceIncident() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
        return;
    const admin = (0, supabase_js_1.createClient)(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin
        .from('service_incidents')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('platform', 'reddit')
        .eq('kind', 'credits_low')
        .is('user_id', null)
        .in('reason_code', ['redditapis_credits_low', 'redditapis_credits_exhausted'])
        .eq('status', 'open');
    if (error)
        throw error;
}
/**
 * Checks RedditAPIs' free account endpoint at most once every 15 minutes.
 * Alerts fire only on a state transition, never on every scheduler run.
 */
async function runRedditApisBalanceMonitor() {
    if (!isRedditApisConfigured())
        return { status: 'disabled', alerted: false };
    try {
        const locked = await redis_1.redis.set(CHECK_LOCK_KEY, '1', 'EX', CHECK_INTERVAL_SECONDS, 'NX');
        if (locked !== 'OK')
            return { status: 'skipped', alerted: false };
    }
    catch (error) {
        // Do not send a duplicate operator alert when Redis cannot protect the
        // transition. Discovery itself already fails closed in this condition.
        logger_1.logger.warn({ error }, 'RedditAPIs balance monitor skipped: Redis unavailable');
        return { status: 'unavailable', alerted: false };
    }
    try {
        const { creditsRemaining } = await (0, redditapis_client_1.fetchRedditApisAccountStatus)();
        const state = classifyRedditApisBalance(creditsRemaining);
        const previousState = await redis_1.redis.get(redditapis_balance_state_1.REDDITAPIS_BALANCE_STATE_KEY);
        let alerted = false;
        if (state === 'healthy') {
            if (previousState === 'low' || previousState === 'depleted') {
                await resolveRecoveredBalanceIncident();
            }
        }
        else if (previousState !== state) {
            alerted = await (0, reddit_delivery_alerts_1.sendRedditDeliveryAlert)({
                kind: 'credits_low',
                code: state === 'depleted'
                    ? 'redditapis_credits_exhausted'
                    : 'redditapis_credits_low',
                detail: `RedditAPIs balance is ${state}. Add provider credit before Reddit monitoring is affected.`,
            });
            // If delivery is unavailable, retain the previous state so the next
            // guarded check can retry the operator alert.
            if (!alerted)
                return { status: state, alerted: false };
        }
        await redis_1.redis.set(redditapis_balance_state_1.REDDITAPIS_BALANCE_STATE_KEY, state, 'EX', STATE_TTL_SECONDS);
        logger_1.logger.info({ state }, 'RedditAPIs balance check completed');
        return { status: state, alerted };
    }
    catch (error) {
        logger_1.logger.error({ error }, 'RedditAPIs balance monitor failed');
        return { status: 'unavailable', alerted: false };
    }
}
