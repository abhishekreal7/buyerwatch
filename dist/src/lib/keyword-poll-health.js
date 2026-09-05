"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keywordPollErrorCode = keywordPollErrorCode;
exports.recordKeywordPollSuccess = recordKeywordPollSuccess;
exports.recordKeywordPollFailure = recordKeywordPollFailure;
const supabase_js_1 = require("@supabase/supabase-js");
const redis_1 = require("./redis");
function getAdminClient() {
    return (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function uniqueKeywordIds(keywordIds) {
    return [...new Set(keywordIds.filter(Boolean))];
}
function keywordPollErrorCode(error) {
    const message = error instanceof Error ? error.message.toLocaleLowerCase() : '';
    if (message.includes('x_search_402')
        || message.includes('creditsdepleted')
        || message.includes('credits depleted'))
        return 'x_credits_exhausted';
    if (message.includes('x_search_400'))
        return 'x_query_invalid';
    if (message.includes('x_search_401'))
        return 'provider_auth_failed';
    if (message.includes('x_search_403'))
        return 'x_access_denied';
    if (message.includes('daily_read_budget_exhausted'))
        return 'provider_budget_exhausted';
    if (message.includes('budget_guard_unavailable'))
        return 'provider_budget_guard_unavailable';
    if (message.includes('circuit_open'))
        return 'provider_circuit_open';
    if (message.includes('429') || message.includes('rate limit'))
        return 'source_rate_limited';
    if (message.includes('timeout') || message.includes('abort'))
        return 'source_timeout';
    if (message.includes('balance'))
        return 'provider_balance_unavailable';
    if (message.includes('authentication') || message.includes('unauthorized'))
        return 'provider_auth_failed';
    if (message.includes('all reddit fetch paths failed'))
        return 'reddit_sources_unavailable';
    if (message.includes('bluesky public search failed'))
        return 'bluesky_source_unavailable';
    return 'source_fetch_failed';
}
async function recordKeywordPollSuccess(keywordIds, checkedAt = new Date(), source) {
    const ids = uniqueKeywordIds(keywordIds);
    if (ids.length === 0)
        return;
    const timestamp = checkedAt.toISOString();
    const { error } = await getAdminClient().rpc('record_keyword_poll_success_v1', {
        p_keyword_ids: ids,
        p_checked_at: timestamp,
    });
    if (error)
        throw new Error(`Unable to record keyword poll success: ${error.message}`);
    // A fallback is still a successful source check, so it must not make the
    // rule look stale. Retain a small non-sensitive marker so the customer can
    // see that Reddit is temporarily running on its resilient fallback path.
    if (source === 'reddit_rss') {
        const { error: sourceError } = await getAdminClient()
            .from('keywords')
            .update({ last_check_error: 'reddit_rss_fallback' })
            .in('id', ids);
        if (sourceError) {
            // The canonical heartbeat was already written by the RPC above. A UI
            // annotation must never turn a successful source check into a failure.
            console.warn('Unable to record Reddit fallback annotation:', sourceError.message);
        }
    }
    const pipeline = redis_1.redis.pipeline();
    for (const keywordId of ids) {
        pipeline.set(`poll:keyword:${keywordId}`, timestamp, 'EX', 7 * 24 * 60 * 60);
    }
    // PostgreSQL is the canonical health state. A legacy Redis checkpoint is
    // only an operational cache and must not turn a successful source fetch into
    // a failed poll when Redis has a transient incident.
    await pipeline.exec().catch(() => undefined);
}
async function recordKeywordPollFailure(keywordIds, error, checkedAt = new Date()) {
    const ids = uniqueKeywordIds(keywordIds);
    if (ids.length === 0)
        return;
    const { error: rpcError } = await getAdminClient().rpc('record_keyword_poll_failure_v1', {
        p_keyword_ids: ids,
        p_error_code: keywordPollErrorCode(error),
        p_checked_at: checkedAt.toISOString(),
    });
    if (rpcError)
        throw new Error(`Unable to record keyword poll failure: ${rpcError.message}`);
    // Remove legacy enqueue-time checkpoints. Only successful source fetches
    // are allowed to advance a keyword heartbeat now.
    const pipeline = redis_1.redis.pipeline();
    for (const keywordId of ids)
        pipeline.del(`poll:keyword:${keywordId}`);
    await pipeline.exec().catch(() => undefined);
}
