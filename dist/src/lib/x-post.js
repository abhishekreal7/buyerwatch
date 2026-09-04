"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isXPostingConfigured = isXPostingConfigured;
exports.postXReply = postXReply;
const supabase_js_1 = require("@supabase/supabase-js");
const encryption_1 = require("./encryption");
const http_1 = require("./http");
const reddit_post_1 = require("./reddit-post");
const redis_lock_1 = require("./redis-lock");
const redis_1 = require("./redis");
function isXPostingConfigured() { return Boolean(process.env.X_OAUTH_CLIENT_ID && process.env.X_OAUTH_CLIENT_SECRET); }
const serviceClient = () => (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
function parseStoredToken(value) { try {
    const token = JSON.parse(value);
    if (token.accessToken)
        return token;
}
catch { } return { accessToken: value }; }
async function refreshAccessToken(userId, refreshToken, storedRefreshToken) {
    const auth = Buffer.from(`${process.env.X_OAUTH_CLIENT_ID}:${process.env.X_OAUTH_CLIENT_SECRET}`).toString('base64');
    const response = await (0, http_1.fetchWithTimeout)('https://api.x.com/2/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString() }, 15_000);
    const raw = await (0, http_1.readResponseText)(response, 64_000);
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        throw new reddit_post_1.PlatformPostError('x', 'token_refresh_invalid_response', false, { reconnectRequired: true });
    }
    if (!response.ok || !payload.access_token)
        throw new reddit_post_1.PlatformPostError('x', payload.error || `token_refresh_${response.status}`, false, { reconnectRequired: true });
    const token = { accessToken: payload.access_token, expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 7200) * 1000 };
    const updates = {
        access_token: (0, encryption_1.encrypt)(JSON.stringify(token)),
    };
    if (payload.refresh_token)
        updates.refresh_token = (0, encryption_1.encrypt)(payload.refresh_token);
    const { data: persisted, error: persistError } = await serviceClient()
        .from('platform_connections')
        .update(updates)
        .eq('user_id', userId)
        .eq('platform', 'x')
        .eq('refresh_token', storedRefreshToken)
        .select('user_id')
        .maybeSingle();
    if (persistError || !persisted) {
        throw new reddit_post_1.PlatformPostError('x', 'token_refresh_persist_failed', true);
    }
    return token;
}
async function xUserAccessToken(userId) {
    if (!isXPostingConfigured())
        throw new reddit_post_1.PlatformPostError('x', 'x_posting_not_configured', false);
    const loadConnection = () => serviceClient()
        .from('platform_connections')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .eq('platform', 'x')
        .maybeSingle();
    const { data, error } = await loadConnection();
    if (error || !data?.access_token)
        throw new reddit_post_1.PlatformPostError('x', 'x_connection_required', false, { reconnectRequired: true });
    const token = parseStoredToken((0, encryption_1.decrypt)(data.access_token));
    if (!token.expiresAt || token.expiresAt > Date.now() + 60_000)
        return token.accessToken;
    const refreshed = await (0, redis_lock_1.withRedisLock)(redis_1.redis, `locks:x-token-refresh:${userId}`, 20_000, async () => {
        const { data: current, error: currentError } = await loadConnection();
        if (currentError || !current?.access_token) {
            throw new reddit_post_1.PlatformPostError('x', 'x_connection_required', false, { reconnectRequired: true });
        }
        const currentToken = parseStoredToken((0, encryption_1.decrypt)(current.access_token));
        if (!currentToken.expiresAt || currentToken.expiresAt > Date.now() + 60_000) {
            return currentToken;
        }
        if (!current.refresh_token) {
            throw new reddit_post_1.PlatformPostError('x', 'x_reconnect_required', false, { reconnectRequired: true });
        }
        return refreshAccessToken(userId, (0, encryption_1.decrypt)(current.refresh_token), current.refresh_token);
    });
    if (!refreshed)
        throw new reddit_post_1.PlatformPostError('x', 'token_refresh_in_progress', true);
    return refreshed.accessToken;
}
async function postXReply(userId, threadExternalId, text) {
    const response = await (0, http_1.fetchWithTimeout)('https://api.x.com/2/tweets', { method: 'POST', headers: { Authorization: `Bearer ${await xUserAccessToken(userId)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: threadExternalId } }) }, 15_000);
    const raw = await (0, http_1.readResponseText)(response, 128_000);
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        throw new reddit_post_1.PlatformPostError('x', 'post_invalid_response', true, { deliveryUncertain: response.status >= 500 });
    }
    if (!response.ok || !payload.data?.id)
        throw new reddit_post_1.PlatformPostError('x', payload.detail || payload.title || `post_${response.status}`, response.status >= 500 || response.status === 429, { deliveryUncertain: response.status >= 500 });
    return { permalink: `https://x.com/i/web/status/${payload.data.id}` };
}
