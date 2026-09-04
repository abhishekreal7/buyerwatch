"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedditApisRequestError = exports.REDDITAPIS_MINIMUM_OPERATIONAL_CREDITS = void 0;
exports.redditApisFetch = redditApisFetch;
exports.redditApisFetchJson = redditApisFetchJson;
exports.getRedditApisDailyBudgetStatus = getRedditApisDailyBudgetStatus;
exports.loginRedditAccount = loginRedditAccount;
exports.fetchRedditAccountProfile = fetchRedditAccountProfile;
exports.fetchRedditPostSnapshot = fetchRedditPostSnapshot;
exports.fetchRedditApisDiscoveryPayload = fetchRedditApisDiscoveryPayload;
exports.fetchRedditCommentReplies = fetchRedditCommentReplies;
exports.fetchRedditApisAccountStatus = fetchRedditApisAccountStatus;
exports.postRedditApisComment = postRedditApisComment;
const env_1 = require("./env");
const http_1 = require("./http");
const redis_1 = require("./redis");
const redditapis_contract_1 = require("./redditapis-contract");
const REDDITAPIS_BASE_URL = 'https://api.redditapis.com';
const MAX_PROVIDER_RESPONSE_BYTES = 256_000;
const PROVIDER_FAILURE_THRESHOLD = 3;
const PROVIDER_OPEN_SECONDS = 5 * 60;
const PROVIDER_BUDGET_KEY_PREFIX = 'budget:redditapis:v1';
const DEFAULT_DAILY_READ_CALL_LIMIT = 250;
const DEFAULT_DAILY_WRITE_CALL_LIMIT = 10;
const MAX_CONFIGURED_DAILY_CALL_LIMIT = 100_000;
const DEFAULT_LOGIN_RETRY_DELAY_MS = 3_000;
const MAX_LOGIN_RETRY_DELAY_MS = 10_000;
const LOGIN_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
// A fully gated automatic reply can require three community-policy reads,
// five bounded preflight pages, and one comment write. Keep headroom above
// that worst-case provider cost so a send does not start with insufficient
// credit and fail halfway through its safety checks.
exports.REDDITAPIS_MINIMUM_OPERATIONAL_CREDITS = 0.05;
class RedditApisRequestError extends Error {
    code;
    status;
    retryable;
    deliveryUncertain;
    reauthRequired;
    constructor(code, status, retryable, deliveryUncertain = false, reauthRequired = false) {
        super(code);
        this.code = code;
        this.status = status;
        this.retryable = retryable;
        this.deliveryUncertain = deliveryUncertain;
        this.reauthRequired = reauthRequired;
        this.name = 'RedditApisRequestError';
    }
}
exports.RedditApisRequestError = RedditApisRequestError;
function getApiKey() {
    const key = (0, env_1.getConfiguredSecret)(process.env.REDDITAPIS_API_KEY);
    if (!key) {
        throw new RedditApisRequestError('reddit_provider_not_configured', null, false);
    }
    return key;
}
function circuitBreakerEnabled() {
    return process.env.NODE_ENV === 'production'
        || process.env.REDDITAPIS_CIRCUIT_BREAKER_ENABLED === 'true';
}
function budgetGuardEnabled() {
    return process.env.NODE_ENV === 'production'
        || process.env.REDDITAPIS_BUDGET_GUARD_ENABLED === 'true';
}
function circuitKey(scope, kind) {
    return `circuit:redditapis:${scope}:${kind}:v2`;
}
function boundedDailyLimit(name, fallback) {
    const raw = process.env[name]?.trim();
    if (!raw)
        return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0)
        return fallback;
    return Math.min(value, MAX_CONFIGURED_DAILY_CALL_LIMIT);
}
function loginRetryDelayMs() {
    const raw = process.env.REDDITAPIS_LOGIN_RETRY_DELAY_MS?.trim();
    if (!raw)
        return DEFAULT_LOGIN_RETRY_DELAY_MS;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0)
        return DEFAULT_LOGIN_RETRY_DELAY_MS;
    return Math.min(value, MAX_LOGIN_RETRY_DELAY_MS);
}
function waitFor(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
function budgetKey(scope, now = new Date()) {
    return `${PROVIDER_BUDGET_KEY_PREFIX}:${scope}:${now.toISOString().slice(0, 10)}`;
}
function secondsUntilBudgetExpiry(now = new Date()) {
    const expiry = new Date(now);
    expiry.setUTCDate(expiry.getUTCDate() + 2);
    expiry.setUTCHours(0, 0, 0, 0);
    return Math.max(60, Math.ceil((expiry.getTime() - now.getTime()) / 1_000));
}
function resolveCircuitScope(path, options) {
    if (options.circuitScope)
        return options.circuitScope;
    if (path.startsWith('/account/'))
        return 'account';
    return options.writeOperation === true ? 'write' : 'read';
}
function resolveBudgetScope(path, init, options) {
    if (options.budgetScope)
        return options.budgetScope;
    if (path.startsWith('/account/'))
        return 'none';
    const method = (init.method ?? 'GET').toUpperCase();
    return options.writeOperation === true || !['GET', 'HEAD'].includes(method)
        ? 'write'
        : 'read';
}
async function assertProviderCircuitClosed(scope, writeOperation) {
    if (!circuitBreakerEnabled())
        return;
    try {
        const openKey = circuitKey(scope, 'open');
        const openedUntil = Number(await redis_1.redis.get(openKey));
        if (Number.isFinite(openedUntil) && openedUntil > Date.now()) {
            throw new RedditApisRequestError('reddit_provider_circuit_open', 503, true);
        }
        if (Number.isFinite(openedUntil) && openedUntil > 0) {
            await redis_1.redis.del(openKey);
        }
    }
    catch (error) {
        if (error instanceof RedditApisRequestError)
            throw error;
        // A write is not allowed to bypass its safety circuit. Read-only discovery
        // can still use its own bounded retry/backoff path during a Redis incident.
        if (writeOperation) {
            throw new RedditApisRequestError('reddit_provider_safety_unavailable', 503, true);
        }
    }
}
async function consumeProviderBudget(scope) {
    if (scope === 'none' || !budgetGuardEnabled())
        return;
    const limit = scope === 'read'
        ? boundedDailyLimit('REDDITAPIS_MAX_DAILY_READ_CALLS', DEFAULT_DAILY_READ_CALL_LIMIT)
        : boundedDailyLimit('REDDITAPIS_MAX_DAILY_WRITE_CALLS', DEFAULT_DAILY_WRITE_CALL_LIMIT);
    if (limit === 0) {
        throw new RedditApisRequestError(`reddit_provider_daily_${scope}_budget_exhausted`, 429, false);
    }
    const script = `
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local maximum = tonumber(ARGV[1])
    if current >= maximum then
      return -1
    end
    local next_value = redis.call('INCR', KEYS[1])
    if next_value == 1 then
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
    end
    if next_value > maximum then
      return -1
    end
    return next_value
  `;
    try {
        const result = Number(await redis_1.redis.eval(script, 1, budgetKey(scope), String(limit), String(secondsUntilBudgetExpiry())));
        if (!Number.isFinite(result) || result < 0) {
            throw new RedditApisRequestError(`reddit_provider_daily_${scope}_budget_exhausted`, 429, false);
        }
    }
    catch (error) {
        if (error instanceof RedditApisRequestError)
            throw error;
        // Paid calls must not bypass the shared cost guard during a Redis outage.
        throw new RedditApisRequestError('reddit_provider_budget_guard_unavailable', 503, true);
    }
}
async function recordProviderFailure(scope, openImmediately = false) {
    if (!circuitBreakerEnabled())
        return;
    const failureKey = circuitKey(scope, 'failures');
    const openKey = circuitKey(scope, 'open');
    const failures = openImmediately
        ? PROVIDER_FAILURE_THRESHOLD
        : await redis_1.redis.incr(failureKey);
    await redis_1.redis.expire(failureKey, PROVIDER_OPEN_SECONDS);
    if (failures >= PROVIDER_FAILURE_THRESHOLD) {
        const openedUntil = Date.now() + PROVIDER_OPEN_SECONDS * 1_000;
        await redis_1.redis.set(openKey, String(openedUntil), 'EX', PROVIDER_OPEN_SECONDS);
    }
}
async function recordProviderSuccess(scope) {
    if (!circuitBreakerEnabled())
        return;
    await redis_1.redis.del(circuitKey(scope, 'failures'), circuitKey(scope, 'open'));
}
function safeProviderPath(path) {
    if (!path.startsWith('/')
        || path.startsWith('//')
        || path.includes('://')
        || !(path.startsWith('/api/') || path.startsWith('/account/'))) {
        throw new RedditApisRequestError('reddit_provider_path_invalid', null, false);
    }
    return path;
}
async function readProviderJson(response) {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_RESPONSE_BYTES) {
        throw new RedditApisRequestError('reddit_provider_response_too_large', response.status, false);
    }
    if (!response.body)
        return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let raw = '';
    let bytesRead = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            bytesRead += value.byteLength;
            if (bytesRead > MAX_PROVIDER_RESPONSE_BYTES) {
                await reader.cancel();
                throw new RedditApisRequestError('reddit_provider_response_too_large', response.status, false);
            }
            raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
    }
    catch (error) {
        if (error instanceof RedditApisRequestError)
            throw error;
        throw new RedditApisRequestError('reddit_provider_response_unreadable', response.status, false);
    }
    finally {
        reader.releaseLock();
    }
    if (!raw.trim())
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new RedditApisRequestError('reddit_provider_response_invalid', response.status, false);
    }
}
async function redditApisFetch(path, init = {}, timeoutMs = 10_000, options = {}) {
    const safePath = safeProviderPath(path);
    const apiKey = getApiKey();
    const circuitScope = resolveCircuitScope(safePath, options);
    const budgetScope = resolveBudgetScope(safePath, init, options);
    await assertProviderCircuitClosed(circuitScope, options.writeOperation === true);
    await consumeProviderBudget(budgetScope);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${apiKey}`);
    headers.set('Accept', 'application/json');
    headers.set('Cache-Control', 'no-cache');
    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    try {
        const response = await (0, http_1.fetchWithTimeout)(`${REDDITAPIS_BASE_URL}${safePath}`, { ...init, headers }, timeoutMs);
        if (response.status === 402) {
            // No balance cannot recover through immediate retries.
            await recordProviderFailure(circuitScope, true).catch(() => undefined);
        }
        else if (response.status === 429 || response.status >= 500) {
            await recordProviderFailure(circuitScope).catch(() => undefined);
        }
        return response;
    }
    catch (error) {
        if (error instanceof RedditApisRequestError)
            throw error;
        await recordProviderFailure(circuitScope).catch(() => undefined);
        throw new RedditApisRequestError(options.writeOperation
            ? 'reddit_delivery_outcome_unknown'
            : 'reddit_provider_unreachable', null, !options.writeOperation, options.writeOperation === true);
    }
}
async function redditApisFetchJson(path, init = {}, timeoutMs = 10_000, options = {}) {
    const safePath = safeProviderPath(path);
    const scope = resolveCircuitScope(safePath, options);
    const response = await redditApisFetch(safePath, init, timeoutMs, options);
    try {
        const payload = await readProviderJson(response);
        if (response.ok)
            await recordProviderSuccess(scope).catch(() => undefined);
        return { response, payload };
    }
    catch (error) {
        if (!response.ok) {
            // The HTTP status is still authoritative when an error body is empty or
            // malformed. In particular, a 429/401 response proves a comment was not
            // accepted and must not be escalated to an uncertain delivery.
            return { response, payload: null };
        }
        await recordProviderFailure(scope).catch(() => undefined);
        throw error;
    }
}
async function getRedditApisDailyBudgetStatus() {
    const readLimit = boundedDailyLimit('REDDITAPIS_MAX_DAILY_READ_CALLS', DEFAULT_DAILY_READ_CALL_LIMIT);
    const writeLimit = boundedDailyLimit('REDDITAPIS_MAX_DAILY_WRITE_CALLS', DEFAULT_DAILY_WRITE_CALL_LIMIT);
    if (!budgetGuardEnabled()) {
        return {
            read: { used: 0, limit: readLimit },
            write: { used: 0, limit: writeLimit },
        };
    }
    try {
        const [rawRead, rawWrite] = await redis_1.redis.mget(budgetKey('read'), budgetKey('write'));
        const normalizeUsage = (value) => {
            const parsed = Number(value);
            return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
        };
        return {
            read: { used: normalizeUsage(rawRead), limit: readLimit },
            write: { used: normalizeUsage(rawWrite), limit: writeLimit },
        };
    }
    catch {
        throw new RedditApisRequestError('reddit_provider_budget_guard_unavailable', 503, true);
    }
}
async function loginRedditAccount(input) {
    const requestLogin = () => redditApisFetchJson('/api/reddit/login', {
        method: 'POST',
        body: JSON.stringify({
            username: input.username,
            password: input.password,
            // The provider's browser login path returns false 401s for some valid,
            // non-2FA accounts. BuyerWatch only needs comment-session cookies, so
            // use the provider's default HTTP flow.
            method: 'http',
            ...(input.totpSecret ? { totp_secret: input.totpSecret } : {}),
        }),
    }, 45_000, { circuitScope: 'account', budgetScope: 'write' });
    let result = await requestLogin();
    if (LOGIN_RETRYABLE_STATUSES.has(result.response.status)) {
        // RedditAPIs documents transient upstream/proxy failures for login. Retry
        // exactly once after a short pause; never retry credential failures or
        // rate limits, and let the shared write budget cap the extra paid call.
        console.warn('[redditapis] Login upstream unavailable; retrying once', {
            status: result.response.status,
            method: 'http',
        });
        await waitFor(loginRetryDelayMs());
        result = await requestLogin();
    }
    const { response, payload } = result;
    if (!response.ok) {
        if (response.status === 401) {
            throw new RedditApisRequestError('reddit_credentials_or_2fa_rejected', 401, false);
        }
        if (response.status === 402) {
            throw new RedditApisRequestError('reddit_provider_balance_unavailable', 402, false);
        }
        if (response.status === 429) {
            throw new RedditApisRequestError('reddit_provider_rate_limited', 429, true);
        }
        if (response.status >= 500) {
            throw new RedditApisRequestError('reddit_provider_temporarily_unavailable', response.status, true);
        }
        throw new RedditApisRequestError('reddit_connection_rejected', response.status, false);
    }
    try {
        return (0, redditapis_contract_1.parseRedditLoginResponse)(payload);
    }
    catch {
        throw new RedditApisRequestError('reddit_connection_response_invalid', response.status, false);
    }
}
async function fetchRedditAccountProfile(username) {
    const { response, payload } = await redditApisFetchJson(`/api/reddit/user/${encodeURIComponent(username)}`, {
        method: 'GET',
    });
    if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new RedditApisRequestError(response.status >= 500 ? 'reddit_provider_temporarily_unavailable' : 'reddit_profile_unavailable', response.status, response.status === 429 || response.status >= 500);
    }
    const profile = payload;
    const rawCreated = typeof profile.created === 'string' ? profile.created : '';
    const createdAt = rawCreated && Number.isFinite(Date.parse(rawCreated))
        ? new Date(rawCreated).toISOString()
        : typeof profile.created_utc === 'number' && Number.isFinite(profile.created_utc)
            ? new Date(profile.created_utc * 1_000).toISOString()
            : null;
    const toInteger = (value) => {
        const number = Number(value);
        return Number.isSafeInteger(number) ? number : null;
    };
    return {
        createdAt,
        linkKarma: toInteger(profile.link_karma),
        commentKarma: toInteger(profile.comment_karma),
    };
}
async function fetchRedditPostSnapshot(postUrl) {
    const target = (0, redditapis_contract_1.parseRedditPostTarget)(postUrl);
    if (!target) {
        throw new RedditApisRequestError('reddit_post_url_invalid', null, false);
    }
    let after = null;
    let lastStatus = 200;
    // Busy communities can publish more than 100 posts between discovery and
    // delivery. Follow a bounded number of cursors so a valid fresh lead does
    // not become a false negative, while keeping latency and paid reads capped.
    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
        const params = new URLSearchParams({
            subreddit: target.subreddit,
            sort: 'new',
            limit: '100',
            ...(after ? { after } : {}),
        });
        const { response, payload } = await redditApisFetchJson(`/api/reddit/posts?${params.toString()}`, {
            method: 'GET',
        });
        lastStatus = response.status;
        if (!response.ok) {
            throw new RedditApisRequestError(response.status === 429 || response.status >= 500
                ? 'reddit_provider_temporarily_unavailable'
                : 'reddit_post_preflight_failed', response.status, response.status === 429 || response.status >= 500);
        }
        const page = (0, redditapis_contract_1.parseRedditApisListingPage)(payload);
        const post = page.posts.find(candidate => candidate.id === target.postId);
        if (post)
            return post;
        if (!page.after || page.after === after)
            break;
        after = page.after;
    }
    throw new RedditApisRequestError('reddit_post_not_found_during_preflight', lastStatus, false);
}
async function fetchRedditApisDiscoveryPayload(subreddit, limit) {
    const normalizedSubreddit = subreddit.trim().toLocaleLowerCase();
    if (!/^[a-z0-9_]{2,50}$/.test(normalizedSubreddit)) {
        throw new RedditApisRequestError('reddit_subreddit_invalid', null, false);
    }
    const params = new URLSearchParams({
        subreddit: normalizedSubreddit,
        sort: 'new',
        limit: String(Math.min(100, Math.max(1, Math.floor(limit)))),
    });
    const { response, payload } = await redditApisFetchJson(`/api/reddit/posts?${params.toString()}`, {
        method: 'GET',
    });
    if (!response.ok) {
        if (response.status === 402) {
            throw new RedditApisRequestError('reddit_provider_balance_unavailable', 402, false);
        }
        throw new RedditApisRequestError(response.status === 429 || response.status >= 500
            ? 'reddit_provider_temporarily_unavailable'
            : 'reddit_discovery_rejected', response.status, response.status === 429 || response.status >= 500);
    }
    return payload;
}
/** Read the direct replies to one BuyerWatch-posted Reddit comment. */
async function fetchRedditCommentReplies(commentId) {
    const normalizedCommentId = commentId.trim().toLowerCase().replace(/^t1_/, '');
    if (!/^[a-z0-9]{3,20}$/i.test(normalizedCommentId)) {
        throw new RedditApisRequestError('reddit_comment_id_invalid', null, false);
    }
    const { response, payload } = await redditApisFetchJson(`/api/reddit/comment/${encodeURIComponent(normalizedCommentId)}`, { method: 'GET' });
    if (!response.ok) {
        if (response.status === 402) {
            throw new RedditApisRequestError('reddit_provider_balance_unavailable', 402, false);
        }
        throw new RedditApisRequestError(response.status === 429 || response.status >= 500
            ? 'reddit_provider_temporarily_unavailable'
            : 'reddit_comment_unavailable', response.status, response.status === 429 || response.status >= 500);
    }
    return (0, redditapis_contract_1.parseRedditDirectCommentReplies)(payload, `t1_${normalizedCommentId}`);
}
async function fetchRedditApisAccountStatus(timeoutMs = 2_500) {
    const { response, payload } = await redditApisFetchJson('/account/me', { method: 'GET' }, timeoutMs, { circuitScope: 'account', budgetScope: 'none' });
    if (!response.ok) {
        throw new RedditApisRequestError(response.status === 429 || response.status >= 500
            ? 'reddit_provider_temporarily_unavailable'
            : 'reddit_provider_authentication_failed', response.status, response.status === 429 || response.status >= 500);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new RedditApisRequestError('reddit_provider_response_invalid', response.status, false);
    }
    const creditsRemaining = Number(payload.credits_remaining);
    if (!Number.isFinite(creditsRemaining) || creditsRemaining < 0) {
        throw new RedditApisRequestError('reddit_provider_response_invalid', response.status, false);
    }
    return { creditsRemaining };
}
async function postRedditApisComment(input) {
    const target = (0, redditapis_contract_1.parseRedditPostTarget)(input.postUrl);
    if (!target) {
        throw new RedditApisRequestError('reddit_post_url_invalid', null, false);
    }
    const { response, payload } = await redditApisFetchJson('/api/reddit/v2/comment', {
        method: 'POST',
        body: JSON.stringify({
            post_url: target.canonicalUrl,
            text: input.text,
            ...input.cookies,
        }),
    }, 45_000, { writeOperation: true, circuitScope: 'write', budgetScope: 'write' }).catch((error) => {
        // Once a write request has reached the provider, an unreadable response
        // cannot prove that Reddit rejected it. Never retry this state: place the
        // send in reconciliation so a user action cannot create a duplicate.
        if (error instanceof RedditApisRequestError && (error.code === 'reddit_provider_daily_write_budget_exhausted'
            || error.code === 'reddit_provider_budget_guard_unavailable'
            || error.code === 'reddit_provider_circuit_open'
            || error.code === 'reddit_provider_not_configured'
            || error.code === 'reddit_provider_safety_unavailable')) {
            throw error;
        }
        throw new RedditApisRequestError('reddit_delivery_outcome_unknown', error instanceof RedditApisRequestError ? error.status : null, false, true);
    });
    if (!response.ok) {
        const reauthRequired = (0, redditapis_contract_1.providerMessageSignalsExpiredSession)(payload);
        if (response.status === 402) {
            throw new RedditApisRequestError('reddit_provider_balance_unavailable', 402, false);
        }
        if (response.status === 429) {
            throw new RedditApisRequestError('reddit_rate_limited', 429, true);
        }
        if (response.status === 401 || (response.status === 403 && reauthRequired)) {
            throw new RedditApisRequestError('reddit_reconnect_required', response.status, false, false, true);
        }
        if (response.status === 403) {
            throw new RedditApisRequestError('reddit_comment_rejected', 403, false);
        }
        if (response.status >= 500) {
            throw new RedditApisRequestError(reauthRequired ? 'reddit_reconnect_required' : 'reddit_delivery_outcome_unknown', response.status, false, !reauthRequired, reauthRequired);
        }
        throw new RedditApisRequestError(reauthRequired ? 'reddit_reconnect_required' : 'reddit_comment_rejected', response.status, false, false, reauthRequired);
    }
    try {
        const result = (0, redditapis_contract_1.parseRedditCommentResponse)(payload);
        const resultTarget = (0, redditapis_contract_1.parseRedditPostTarget)(result.permalink);
        if (!resultTarget
            || resultTarget.postId !== target.postId
            || resultTarget.subreddit.toLowerCase() !== target.subreddit.toLowerCase()) {
            throw new Error('comment_target_mismatch');
        }
        return result;
    }
    catch {
        const reauthRequired = (0, redditapis_contract_1.providerMessageSignalsExpiredSession)(payload);
        throw new RedditApisRequestError(reauthRequired ? 'reddit_reconnect_required' : 'reddit_delivery_outcome_unknown', response.status, false, !reauthRequired, reauthRequired);
    }
}
