"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchBlueskyPosts = searchBlueskyPosts;
const encryption_1 = require("./encryption");
const env_1 = require("./env");
const http_1 = require("./http");
const redis_1 = require("./redis");
const APPVIEW_HOSTS = [
    'https://public.api.bsky.app',
    'https://api.bsky.app',
];
const BLUESKY_ENTRYWAY = 'https://bsky.social';
const BLUESKY_SESSION_CACHE_KEY = 'session:bluesky:discovery:v1';
const BLUESKY_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_BLUESKY_RESPONSE_BYTES = 1_000_000;
let authenticatedSessionPromise = null;
class BlueskyRequestError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'BlueskyRequestError';
    }
}
function isBlueskySession(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const session = value;
    return (typeof session.refreshJwt === 'string'
        && typeof session.accessJwt === 'string'
        && typeof session.handle === 'string'
        && typeof session.did === 'string'
        && typeof session.active === 'boolean');
}
function isNormalizedPost(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const post = value;
    return (post.platform === 'bluesky'
        && typeof post.externalId === 'string'
        && typeof post.author === 'string'
        && typeof post.text === 'string'
        && typeof post.url === 'string'
        && typeof post.createdAt === 'string'
        && Number.isFinite(Date.parse(post.createdAt))
        && typeof post.sourceTarget === 'string');
}
function parseCachedPosts(value) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) && parsed.every(isNormalizedPost) ? parsed : null;
    }
    catch {
        return null;
    }
}
function parseSearchPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Bluesky search response was invalid');
    }
    const payload = value;
    if (payload.posts !== undefined && !Array.isArray(payload.posts)) {
        throw new Error('Bluesky search response was invalid');
    }
    return payload;
}
async function readSearchPayload(response) {
    const raw = await (0, http_1.readResponseText)(response, MAX_BLUESKY_RESPONSE_BYTES);
    if (!raw.trim())
        throw new Error('Bluesky search response was invalid');
    try {
        return parseSearchPayload(JSON.parse(raw));
    }
    catch (error) {
        if (error instanceof Error && error.message === 'Bluesky search response was invalid') {
            throw error;
        }
        throw new Error('Bluesky search response was invalid', { cause: error });
    }
}
async function readJsonPayload(response) {
    const raw = await (0, http_1.readResponseText)(response, MAX_BLUESKY_RESPONSE_BYTES);
    if (!raw.trim())
        return null;
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        throw new Error('Bluesky response was invalid', { cause: error });
    }
}
function jwtExpiryMs(token) {
    try {
        const payload = token.split('.')[1];
        if (!payload)
            return null;
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        const expiresAt = Number(decoded.exp) * 1_000;
        return Number.isFinite(expiresAt) ? expiresAt : null;
    }
    catch {
        return null;
    }
}
function accessTokenIsUsable(session, now = Date.now()) {
    const expiresAt = jwtExpiryMs(session.accessJwt);
    return expiresAt !== null && expiresAt - now > 2 * 60_000;
}
function sessionCacheTtl(session, now = Date.now()) {
    const refreshExpiresAt = jwtExpiryMs(session.refreshJwt);
    if (refreshExpiresAt === null)
        return BLUESKY_SESSION_TTL_SECONDS;
    return Math.max(60, Math.min(BLUESKY_SESSION_TTL_SECONDS, Math.floor((refreshExpiresAt - now - 60_000) / 1_000)));
}
async function persistDiscoverySession(session) {
    await redis_1.redis.set(BLUESKY_SESSION_CACHE_KEY, (0, encryption_1.encrypt)(JSON.stringify(session)), 'EX', sessionCacheTtl(session)).catch(() => undefined);
}
async function loadCachedDiscoverySession() {
    try {
        const cached = await redis_1.redis.get(BLUESKY_SESSION_CACHE_KEY);
        if (!cached)
            return null;
        const parsed = JSON.parse((0, encryption_1.decrypt)(cached));
        if (isBlueskySession(parsed))
            return parsed;
    }
    catch {
        // Corrupt or expired sessions are discarded and replaced by a fresh login.
    }
    await redis_1.redis.del(BLUESKY_SESSION_CACHE_KEY).catch(() => undefined);
    return null;
}
function parseSessionPayload(value) {
    if (!isBlueskySession(value))
        throw new Error('Bluesky session response was invalid');
    return value;
}
async function requestBlueskySession(path, init) {
    const response = await (0, http_1.fetchWithTimeout)(new URL(path, BLUESKY_ENTRYWAY), {
        ...init,
        headers: {
            Accept: 'application/json',
            ...init.headers,
        },
    }, 15_000);
    const payload = await readJsonPayload(response);
    if (!response.ok) {
        throw new BlueskyRequestError(response.status, 'Bluesky session request failed');
    }
    const session = parseSessionPayload(payload);
    await persistDiscoverySession(session);
    return session;
}
async function createBlueskySession() {
    const handle = (0, env_1.getConfiguredSecret)(process.env.BLUESKY_HANDLE);
    const password = (0, env_1.getConfiguredSecret)(process.env.BLUESKY_APP_PASSWORD);
    if (!handle || !password) {
        throw new Error('Bluesky authenticated search is not configured');
    }
    return requestBlueskySession('/xrpc/com.atproto.server.createSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: handle, password }),
    });
}
async function refreshBlueskySession(session) {
    return requestBlueskySession('/xrpc/com.atproto.server.refreshSession', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.refreshJwt}` },
    });
}
async function createAuthenticatedDiscoverySession() {
    const cached = await loadCachedDiscoverySession();
    if (cached) {
        if (accessTokenIsUsable(cached))
            return cached;
        try {
            return await refreshBlueskySession(cached);
        }
        catch (error) {
            if (!(error instanceof BlueskyRequestError)
                || ![400, 401, 403].includes(error.status)) {
                throw error;
            }
        }
        await redis_1.redis.del(BLUESKY_SESSION_CACHE_KEY).catch(() => undefined);
    }
    return createBlueskySession();
}
async function getAuthenticatedDiscoverySession() {
    if (!authenticatedSessionPromise) {
        authenticatedSessionPromise = createAuthenticatedDiscoverySession().catch((error) => {
            authenticatedSessionPromise = null;
            throw error;
        });
    }
    return authenticatedSessionPromise;
}
async function searchWithAuthenticatedSession(query, limit) {
    const search = async () => {
        const session = await getAuthenticatedDiscoverySession();
        const url = new URL('/xrpc/app.bsky.feed.searchPosts', BLUESKY_ENTRYWAY);
        url.searchParams.set('q', query);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('sort', 'latest');
        const response = await (0, http_1.fetchWithTimeout)(url, {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${session.accessJwt}`,
                'User-Agent': 'BuyerWatch/1.0 (support@buyerwatch.co)',
            },
        }, 15_000);
        if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            throw new BlueskyRequestError(response.status, 'Bluesky authenticated search failed');
        }
        return readSearchPayload(response);
    };
    try {
        return await search();
    }
    catch (error) {
        if (!(error instanceof BlueskyRequestError) || ![401, 403].includes(error.status)) {
            throw error;
        }
        authenticatedSessionPromise = null;
        await redis_1.redis.del(BLUESKY_SESSION_CACHE_KEY).catch(() => undefined);
        return search();
    }
}
function normalizeSearchPosts(payload, sourceTarget) {
    return (payload.posts ?? []).flatMap((post) => {
        if (typeof post.uri !== 'string'
            || !post.uri.startsWith('at://')
            || typeof post.author !== 'object'
            || post.author === null) {
            return [];
        }
        const postId = post.uri.split('/').at(-1);
        const profile = post.author.did || post.author.handle;
        const createdAt = post.record?.createdAt || post.indexedAt;
        if (!postId
            || !/^[a-z0-9]{1,80}$/i.test(postId)
            || !profile
            || profile.length > 253
            || !createdAt
            || !Number.isFinite(Date.parse(createdAt))) {
            return [];
        }
        const authorHandle = post.author.handle || profile;
        return [{
                platform: 'bluesky',
                externalId: post.uri.slice(0, 1_000),
                author: authorHandle.slice(0, 253),
                text: (post.record?.text || '').slice(0, 10_000),
                url: `https://bsky.app/profile/${encodeURIComponent(profile)}/post/${encodeURIComponent(postId)}`,
                createdAt: new Date(createdAt).toISOString(),
                sourceTarget,
            }];
    });
}
async function searchBlueskyPosts(query, limit = 25) {
    if ((0, env_1.isDevelopmentMockEnabled)('USE_MOCK_BLUESKY')) {
        return [
            {
                platform: 'bluesky',
                externalId: `mock-bsky-${Date.now()}`,
                author: 'mock_user.bsky.social',
                text: `This is a mock Bluesky post matching query: ${query}`,
                url: 'https://bsky.app/profile/mock_user.bsky.social/post/mock_post',
                createdAt: new Date().toISOString(),
                sourceTarget: query
            }
        ];
    }
    const normalizedQuery = query.trim();
    if (!normalizedQuery)
        return [];
    const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const cacheKey = `search:bluesky:${normalizedQuery.toLocaleLowerCase()}:${boundedLimit}`;
    try {
        const cached = await redis_1.redis.get(cacheKey);
        if (cached) {
            const posts = parseCachedPosts(cached);
            if (posts)
                return posts;
            await redis_1.redis.del(cacheKey).catch(() => undefined);
        }
    }
    catch {
        // Monitoring remains available if Redis has a transient cache failure.
    }
    let payload = null;
    let failureStatus = 503;
    for (const host of APPVIEW_HOSTS) {
        const hostBackoffKey = `backoff:bluesky-appview:${new URL(host).hostname}`;
        try {
            if (await redis_1.redis.get(hostBackoffKey))
                continue;
        }
        catch {
            // Source fetching remains available during a cache incident.
        }
        const url = new URL('/xrpc/app.bsky.feed.searchPosts', host);
        url.searchParams.set('q', normalizedQuery);
        url.searchParams.set('limit', String(boundedLimit));
        url.searchParams.set('sort', 'latest');
        const response = await (0, http_1.fetchWithTimeout)(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'BuyerWatch/1.0 (support@buyerwatch.co)',
            },
        }, 15_000);
        if (response.ok) {
            payload = await readSearchPayload(response);
            break;
        }
        failureStatus = response.status;
        await response.body?.cancel().catch(() => undefined);
        if ([401, 403, 404].includes(response.status) || response.status >= 500) {
            await redis_1.redis.set(hostBackoffKey, String(response.status), 'EX', response.status >= 500 ? 120 : 15 * 60).catch(() => { });
        }
        // The cached public hostname can be unavailable in some regions. The
        // canonical AppView is an official fallback; rate limits are not bypassed.
        if (![401, 403, 404].includes(response.status) && response.status < 500)
            break;
    }
    if (!payload) {
        try {
            payload = await searchWithAuthenticatedSession(normalizedQuery, boundedLimit);
        }
        catch (error) {
            throw new Error(`Bluesky search failed (${failureStatus})`, { cause: error });
        }
    }
    const posts = normalizeSearchPosts(payload, normalizedQuery);
    await redis_1.redis.set(cacheKey, JSON.stringify(posts), 'EX', 120).catch(() => { });
    return posts;
}
