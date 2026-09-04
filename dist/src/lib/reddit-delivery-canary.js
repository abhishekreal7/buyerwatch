"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRedditDeliveryCanary = runRedditDeliveryCanary;
const admin_1 = require("./admin");
const env_1 = require("./env");
const hyperbrowser_reddit_1 = require("./hyperbrowser-reddit");
const logger_1 = require("./logger");
const reddit_delivery_alerts_1 = require("./reddit-delivery-alerts");
const reddit_delivery_health_1 = require("./reddit-delivery-health");
const redis_1 = require("./redis");
const reddit_session_1 = require("./reddit-session");
const reddit_service_safety_1 = require("./reddit-service-safety");
const CANARY_DUE_KEY = 'schedule:reddit-delivery-canary:v1';
const CANARY_CURSOR_KEY = 'cursor:reddit-delivery-canary:v1';
const SUCCESS_INTERVAL_SECONDS = 6 * 60 * 60;
const FAILURE_RETRY_SECONDS = 15 * 60;
function lowCreditPercent() {
    const value = Number(process.env.HYPERBROWSER_CREDIT_ALERT_PERCENT);
    return Number.isSafeInteger(value) && value >= 1 && value <= 100 ? value : 20;
}
async function nextActiveUserId() {
    const admin = (0, admin_1.getServiceRoleClient)();
    const cursor = await redis_1.redis.get(CANARY_CURSOR_KEY).catch(() => null);
    const base = () => admin
        .from('reddit_connection_secrets')
        .select('user_id')
        .eq('provider', 'hyperbrowser')
        .eq('status', 'active')
        .order('user_id', { ascending: true })
        .limit(1);
    const first = cursor ? await base().gt('user_id', cursor) : await base();
    if (first.error)
        throw first.error;
    let userId = first.data?.[0]?.user_id ?? null;
    if (!userId && cursor) {
        const wrapped = await base();
        if (wrapped.error)
            throw wrapped.error;
        userId = wrapped.data?.[0]?.user_id ?? null;
    }
    if (userId)
        await redis_1.redis.set(CANARY_CURSOR_KEY, userId, 'EX', 30 * 24 * 60 * 60);
    return userId;
}
async function runRedditDeliveryCanary() {
    if ((0, env_1.getRedditPostingProviderKind)() !== 'hyperbrowser') {
        return { status: 'skipped', code: 'hyperbrowser_disabled' };
    }
    const lease = await redis_1.redis.set(CANARY_DUE_KEY, 'running', 'EX', 10 * 60, 'NX');
    if (lease !== 'OK')
        return { status: 'skipped', code: 'not_due' };
    let userId = null;
    try {
        userId = await nextActiveUserId();
        const credits = await (0, hyperbrowser_reddit_1.fetchHyperbrowserCreditInfo)();
        const percentRemaining = credits.limit > 0 ? (credits.remaining / credits.limit) * 100 : 0;
        if (percentRemaining <= lowCreditPercent()) {
            await (0, reddit_delivery_alerts_1.sendRedditDeliveryAlert)({
                kind: 'credits_low',
                code: 'hyperbrowser_credits_low',
                ...(userId ? { userId } : {}),
                detail: `${credits.remaining} of ${credits.limit} credits remain.`,
            });
        }
        if (userId) {
            const session = await (0, reddit_session_1.getActiveRedditSession)(userId);
            if (session.provider !== 'hyperbrowser') {
                throw new hyperbrowser_reddit_1.HyperbrowserRedditError('reddit_reconnect_required', false, false, true);
            }
            const profile = await (0, hyperbrowser_reddit_1.fetchHyperbrowserRedditAccountProfile)({
                username: session.username,
                profileId: session.profileId,
            });
            await (0, reddit_session_1.updateRedditConnectionAccountProfile)(userId, {
                accountCreatedAt: profile.createdAt,
                linkKarma: profile.linkKarma,
                commentKarma: profile.commentKarma,
            });
            await (0, reddit_session_1.markRedditConnectionHealthy)(userId);
        }
        await (0, reddit_delivery_health_1.recordHyperbrowserHealth)({
            status: 'ok',
            creditsRemaining: credits.remaining,
            creditsLimit: credits.limit,
        });
        await (0, reddit_service_safety_1.closeTransientRedditCircuitAfterCanary)();
        await redis_1.redis.set(CANARY_DUE_KEY, 'verified', 'EX', SUCCESS_INTERVAL_SECONDS);
        return { status: 'ok', checkedUser: Boolean(userId) };
    }
    catch (error) {
        const providerError = error instanceof hyperbrowser_reddit_1.HyperbrowserRedditError ? error : null;
        const code = providerError?.code ?? 'hyperbrowser_canary_failed';
        if (code === 'hyperbrowser_session_busy') {
            await redis_1.redis.set(CANARY_DUE_KEY, 'busy', 'EX', 5 * 60);
            return { status: 'skipped', code };
        }
        await (0, reddit_delivery_health_1.recordHyperbrowserHealth)({ status: 'error', code }).catch(() => undefined);
        if (userId && providerError?.reauthRequired) {
            await (0, reddit_session_1.markRedditConnectionReauthRequired)(userId, code).catch(() => undefined);
        }
        await (0, reddit_delivery_alerts_1.sendRedditDeliveryAlert)({
            kind: code === 'hyperbrowser_credits_exhausted'
                ? 'credits_low'
                : providerError?.reauthRequired
                    ? 'reconnect_required'
                    : 'canary_failed',
            code,
            ...(userId ? { userId } : {}),
        }).catch(() => undefined);
        await redis_1.redis.set(CANARY_DUE_KEY, 'failed', 'EX', FAILURE_RETRY_SECONDS).catch(() => undefined);
        logger_1.logger.error({ error, code }, 'Reddit delivery canary failed');
        return { status: 'failed', code, checkedUser: Boolean(userId) };
    }
}
