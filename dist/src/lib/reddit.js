"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSubredditRssUrl = buildSubredditRssUrl;
exports.buildSubredditRssUrls = buildSubredditRssUrls;
exports.shouldBackoffRedditRssStatus = shouldBackoffRedditRssStatus;
exports.parseRedditRss = parseRedditRss;
exports.normalizeRedditApisPosts = normalizeRedditApisPosts;
exports.fetchSubredditNewWithSource = fetchSubredditNewWithSource;
exports.fetchSubredditNew = fetchSubredditNew;
const http_1 = require("./http");
const redis_1 = require("./redis");
const env_1 = require("./env");
const redditapis_client_1 = require("./redditapis-client");
const redditapis_contract_1 = require("./redditapis-contract");
const sprinklr_client_1 = require("./sprinklr-client");
const MAX_REDDIT_SOURCE_BYTES = 1_000_000;
const MAX_POST_TEXT_LENGTH = 100_000;
const MAX_POST_TITLE_LENGTH = 1_000;
const MAX_AUTHOR_LENGTH = 64;
const REDDIT_POST_ID_PATTERN = /^[a-z0-9]{5,12}$/i;
/**
 * Keep Reddit's public feed URL canonical and query-free. In production,
 * Reddit has intermittently rate-limited otherwise identical Atom requests
 * carrying `?limit=...`. The feed already returns a bounded page; callers
 * apply their requested limit after parsing.
 */
function buildSubredditRssUrl(subreddit) {
    return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new/.rss`;
}
function buildSubredditRssUrls(subreddit) {
    const encoded = encodeURIComponent(subreddit);
    return [
        `https://www.reddit.com/r/${encoded}/new/.rss`,
        `https://www.reddit.com/r/${encoded}/new.rss`,
        `https://old.reddit.com/r/${encoded}/new/.rss`,
        `https://old.reddit.com/r/${encoded}/new.rss`,
    ];
}
function shouldBackoffRedditRssStatus(status) {
    return status === 403 || status === 429;
}
function truncate(value, maximum) {
    return value.length <= maximum ? value : value.slice(0, maximum);
}
function normalizedPostText(title, body) {
    const combined = body ? `${title}\n\n${body}`.trim() : title;
    return truncate(combined, MAX_POST_TEXT_LENGTH);
}
/**
 * Parse Reddit's public Atom RSS feed for a subreddit.
 * No external dependencies — regex extraction on the XML string.
 * Provides: id, author, title, body text, url, published timestamp.
 * These are exactly the fields NormalizedPost uses; upvote/comment counts
 * are not part of the data model and are not used by the scoring pipeline.
 */
function parseRedditRss(xml, subreddit) {
    const posts = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];
        // <id>t3_POSTID</id> — strip the "t3_" fullname prefix to stay consistent
        // with the post.id format returned by the JSON API (used in dedup checks)
        const idMatch = entry.match(/<id>[^<]*?([a-z0-9]+)<\/id>/);
        const externalId = idMatch?.[1]?.trim().toLowerCase() ?? '';
        // <author><name>/u/username</name></author>
        const authorMatch = entry.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/);
        const author = truncate((authorMatch?.[1]?.trim() ?? '').replace(/^\/u\//, ''), MAX_AUTHOR_LENGTH);
        // <title>Post title</title>
        const titleMatch = entry.match(/<title>([^<]*)<\/title>/);
        const title = truncate(decodeXmlEntities(titleMatch?.[1]?.trim() ?? ''), MAX_POST_TITLE_LENGTH);
        // <link href="https://www.reddit.com/r/.../comments/.../" />
        const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);
        const rawUrl = decodeXmlEntities(linkMatch?.[1]?.trim() ?? '');
        const target = (0, redditapis_contract_1.parseRedditPostTarget)(rawUrl);
        // <published>2026-07-22T21:58:40+00:00</published>
        const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
        const rawCreatedAt = publishedMatch?.[1]?.trim() ?? '';
        const createdAt = Number.isFinite(Date.parse(rawCreatedAt))
            ? new Date(rawCreatedAt).toISOString()
            : null;
        // <content type="html">HTML-encoded body containing Reddit markdown div</content>
        const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
        let bodyText = '';
        if (contentMatch?.[1]) {
            bodyText = truncate(decodeXmlEntities(contentMatch[1])
                .replace(/<[^>]+>/g, ' ') // strip all HTML tags
                .replace(/\s+/g, ' ') // collapse whitespace
                .trim(), MAX_POST_TEXT_LENGTH);
        }
        const text = normalizedPostText(title, bodyText);
        // Never invent a timestamp or trust a non-Reddit/external destination URL.
        // Both would bypass freshness or break the delivery preflight later.
        if (!REDDIT_POST_ID_PATTERN.test(externalId)
            || !target
            || target.postId !== externalId
            || target.subreddit.toLowerCase() !== subreddit.toLowerCase()
            || !createdAt
            || !text)
            continue;
        posts.push({
            platform: 'reddit',
            externalId,
            author,
            title,
            text,
            url: target.canonicalUrl,
            createdAt,
            sourceTarget: subreddit,
        });
    }
    return posts;
}
function decodeXmlEntities(str) {
    return str
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#32;/g, ' ')
        .replace(/&apos;/g, "'");
}
function normalizeRedditApisPosts(payload, subreddit) {
    if (!payload || typeof payload !== 'object')
        return [];
    const posts = payload.posts;
    if (!Array.isArray(posts))
        return [];
    return posts.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object')
            return [];
        const post = candidate;
        const externalId = typeof post.id === 'string'
            ? post.id.trim().replace(/^t3_/i, '').toLowerCase()
            : '';
        const title = typeof post.title === 'string'
            ? truncate(post.title.trim(), MAX_POST_TITLE_LENGTH)
            : '';
        const body = typeof post.text === 'string'
            ? truncate(post.text.trim(), MAX_POST_TEXT_LENGTH)
            : '';
        const author = typeof post.author === 'string'
            ? truncate(post.author.trim().replace(/^u\//i, ''), MAX_AUTHOR_LENGTH)
            : '';
        const permalink = typeof post.permalink === 'string' ? post.permalink.trim() : '';
        const directUrl = typeof post.url === 'string' ? post.url.trim() : '';
        const permalinkUrl = permalink.startsWith('/') ? `https://www.reddit.com${permalink}` : permalink;
        // A Reddit link post's `url` can be its external destination. Prefer the
        // permalink and accept `url` only when it is itself a canonical post URL.
        const target = (0, redditapis_contract_1.parseRedditPostTarget)(permalinkUrl) ?? (0, redditapis_contract_1.parseRedditPostTarget)(directUrl);
        const createdAt = typeof post.created === 'string' && Number.isFinite(Date.parse(post.created))
            ? new Date(post.created).toISOString()
            : typeof post.created_utc === 'number' && Number.isFinite(post.created_utc)
                ? new Date(post.created_utc * 1_000).toISOString()
                : '';
        if (!REDDIT_POST_ID_PATTERN.test(externalId)
            || !target
            || target.postId !== externalId
            || target.subreddit.toLowerCase() !== subreddit.toLowerCase()
            || !createdAt
            || !author
            || (!title && !body))
            return [];
        return [{
                platform: 'reddit',
                externalId,
                author,
                title,
                text: normalizedPostText(title, body),
                url: target.canonicalUrl,
                createdAt,
                sourceTarget: subreddit,
            }];
    });
}
function parseCachedRedditPosts(raw, subreddit, limit) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!Array.isArray(value) || value.length > 100)
        return null;
    const posts = [];
    for (const candidate of value) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
            return null;
        const post = candidate;
        const target = (0, redditapis_contract_1.parseRedditPostTarget)(post.url);
        const externalId = typeof post.externalId === 'string'
            ? post.externalId.trim().replace(/^t3_/i, '').toLowerCase()
            : '';
        const createdAt = typeof post.createdAt === 'string' && Number.isFinite(Date.parse(post.createdAt))
            ? new Date(post.createdAt).toISOString()
            : null;
        const author = typeof post.author === 'string' && post.author.length <= MAX_AUTHOR_LENGTH
            ? post.author
            : null;
        const title = typeof post.title === 'string' && post.title.length <= MAX_POST_TITLE_LENGTH
            ? post.title
            : undefined;
        const text = typeof post.text === 'string' && post.text.length <= MAX_POST_TEXT_LENGTH
            ? post.text
            : null;
        if (post.platform !== 'reddit'
            || !REDDIT_POST_ID_PATTERN.test(externalId)
            || !target
            || target.postId !== externalId
            || target.subreddit.toLowerCase() !== subreddit.toLowerCase()
            || !createdAt
            || author === null
            || !text)
            return null;
        posts.push({
            platform: 'reddit',
            externalId,
            author,
            ...(title !== undefined ? { title } : {}),
            text,
            url: target.canonicalUrl,
            createdAt,
            sourceTarget: subreddit,
        });
    }
    return posts.slice(0, limit);
}
async function fetchSubredditNewWithSource(subreddit, limit = 25, options = {}) {
    const normalizedSubreddit = subreddit.trim().replace(/^r\//i, '').toLowerCase();
    if (!/^[a-z0-9_]{2,50}$/.test(normalizedSubreddit)) {
        throw new Error('Invalid subreddit target');
    }
    const numericLimit = Number.isFinite(limit) ? Math.floor(limit) : 25;
    const boundedLimit = Math.min(100, Math.max(1, numericLimit));
    const forceLive = process.env.REDDIT_PROVIDER_FORCE_LIVE === 'true'
        || process.env.REDDITAPIS_FORCE_LIVE === 'true';
    const configuredProvider = (0, env_1.getRedditDiscoveryProviderKind)();
    const providerKind = configuredProvider
        && (process.env.NODE_ENV !== 'development' || forceLive)
        ? configuredProvider
        : null;
    const providerDiscoveryEnabled = options.mode !== 'rss_only'
        && (0, env_1.hasRedditDiscoveryProvider)()
        && providerKind !== null;
    // ── Redis cache key ────────────────────────────────────────────────
    // Each upstream has an independent cache. When the paid provider is enabled,
    // its cache is authoritative: a successful RSS response must never mask a
    // later provider result just because it arrived first.
    let redisClient = null;
    const cacheKey = `rss:r:v2:${normalizedSubreddit}:${boundedLimit}`;
    const providerCacheKey = `${providerKind ?? 'none'}:r:v3:${normalizedSubreddit}:${boundedLimit}`;
    const rssBackoffKey = `backoff:rss:r:${normalizedSubreddit}`;
    const CACHE_TTL = 300; // 5 minutes
    const providerCacheSecondsRaw = Number(providerKind === 'sprinklr'
        ? process.env.SPRINKLR_DISCOVERY_CACHE_SECONDS
        : process.env.REDDITAPIS_DISCOVERY_CACHE_SECONDS);
    const PROVIDER_CACHE_TTL = Number.isSafeInteger(providerCacheSecondsRaw)
        ? providerKind === 'sprinklr'
            ? Math.min(15 * 60, Math.max(60, providerCacheSecondsRaw))
            : Math.min(30 * 60, Math.max(5 * 60, providerCacheSecondsRaw))
        : providerKind === 'sprinklr' ? 2 * 60 : 15 * 60;
    try {
        redisClient = redis_1.redis;
        const preferredCacheKey = providerDiscoveryEnabled ? providerCacheKey : cacheKey;
        const cached = await redis_1.redis.get(preferredCacheKey);
        if (cached) {
            const posts = parseCachedRedditPosts(cached, normalizedSubreddit, boundedLimit);
            if (posts) {
                console.log(`[reddit] ${providerDiscoveryEnabled ? providerKind : 'RSS'} cache HIT for r/${normalizedSubreddit} (${posts.length} posts)`);
                return { posts, source: providerDiscoveryEnabled ? 'provider' : 'rss' };
            }
            await redis_1.redis.del(preferredCacheKey).catch(() => undefined);
        }
    }
    catch (cacheErr) {
        console.warn(`[reddit] Redis cache unavailable, continuing without cache:`, cacheErr);
    }
    // ── PRIMARY: managed discovery provider (when explicitly enabled) ─────────
    // This generalizes the previous RedditAPIs primary discovery contract while
    // preserving its provider-first behavior for existing deployments.
    // RSS is useful as a free best-effort feed, but it is not reliable enough to
    // be the production source of truth once the managed provider is configured.
    let providerFailure;
    if (providerDiscoveryEnabled) {
        try {
            console.log(`[reddit] ${providerKind} primary discovery for r/${normalizedSubreddit}`);
            const normalized = providerKind === 'sprinklr'
                ? await (0, sprinklr_client_1.fetchSprinklrRedditPosts)(normalizedSubreddit, boundedLimit)
                : normalizeRedditApisPosts(await (0, redditapis_client_1.fetchRedditApisDiscoveryPayload)(normalizedSubreddit, boundedLimit), normalizedSubreddit);
            if (redisClient) {
                // Cache empty responses too. A quiet subreddit must not consume another
                // paid read on every scheduler tick.
                await redisClient.set(providerCacheKey, JSON.stringify(normalized), 'EX', PROVIDER_CACHE_TTL).catch(() => { });
            }
            return { posts: normalized, source: 'provider' };
        }
        catch (providerError) {
            providerFailure = providerError;
            console.warn(`[reddit] ${providerKind} primary discovery failed for r/${normalizedSubreddit}; trying RSS fallback:`, providerError);
        }
    }
    // ── FALLBACK: Reddit public RSS feed ──────────────────────────────────────
    let rssBackoffActive = false;
    try {
        rssBackoffActive = Boolean(await redis_1.redis.get(rssBackoffKey));
    }
    catch {
        // A missing backoff cache is not a reason to skip the bounded source call.
    }
    if (!rssBackoffActive) {
        let retryAfterSeconds = null;
        let shouldBackoff = false;
        for (const rssUrl of buildSubredditRssUrls(normalizedSubreddit)) {
            try {
                const rssHost = new URL(rssUrl).hostname;
                console.log(`[reddit] RSS fetch via ${rssHost} for r/${normalizedSubreddit}`);
                const rssResponse = await (0, http_1.fetchWithTimeout)(rssUrl, {
                    headers: {
                        'User-Agent': process.env.REDDIT_USER_AGENT || 'BuyerWatch/1.0 (support@buyerwatch.co)',
                        'Accept': 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                    }
                }, 10_000);
                if (rssResponse.ok) {
                    const xml = await (0, http_1.readResponseText)(rssResponse, MAX_REDDIT_SOURCE_BYTES);
                    if (!/<feed(?:\s|>)/i.test(xml))
                        throw new Error('reddit_rss_invalid_feed');
                    const posts = parseRedditRss(xml, normalizedSubreddit).slice(0, boundedLimit);
                    console.log(`[reddit] RSS: ${posts.length} posts from r/${normalizedSubreddit} via ${rssHost}`);
                    if (redisClient) {
                        // Cache a valid empty listing too. Quiet communities are successful
                        // checks and must not be retried every scheduler tick.
                        await Promise.all([
                            redisClient.set(cacheKey, JSON.stringify(posts), 'EX', CACHE_TTL),
                            redisClient.del(rssBackoffKey),
                        ]).catch(() => { });
                    }
                    return { posts, source: 'rss' };
                }
                console.warn(`[reddit] RSS ${rssResponse.status} via ${rssHost} for r/${normalizedSubreddit}`);
                if (shouldBackoffRedditRssStatus(rssResponse.status)) {
                    shouldBackoff = true;
                    const retryAfterHeader = rssResponse.headers.get('retry-after');
                    const hostRetryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
                    if (Number.isFinite(hostRetryAfter) && hostRetryAfter >= 0) {
                        retryAfterSeconds = Math.max(retryAfterSeconds ?? 0, hostRetryAfter);
                    }
                }
            }
            catch (rssErr) {
                console.warn(`[reddit] RSS failed via ${new URL(rssUrl).hostname} for r/${normalizedSubreddit}:`, rssErr);
            }
        }
        // Back off only after every bounded host option fails. A 429 from one
        // hostname must not suppress a healthy equivalent feed on the other.
        if (shouldBackoff) {
            const backoffSeconds = retryAfterSeconds !== null
                ? Math.min(60 * 60, Math.max(5 * 60, Math.ceil(retryAfterSeconds)))
                : 15 * 60;
            await redis_1.redis.set(rssBackoffKey, '1', 'EX', backoffSeconds).catch(() => { });
        }
    }
    // ── Development-only fallback: public .json endpoint ──────────────────────
    if (process.env.NODE_ENV !== 'production' && !providerDiscoveryEnabled) {
        try {
            console.log(`[reddit] Attempting public JSON feed for r/${normalizedSubreddit}`);
            const url = `https://www.reddit.com/r/${normalizedSubreddit}/new.json?limit=${boundedLimit}`;
            const response = await (0, http_1.fetchWithTimeout)(url, {
                headers: {
                    'User-Agent': process.env.REDDIT_USER_AGENT || 'BuyerWatch/1.0 (support@buyerwatch.co)',
                }
            }, 10_000);
            if (response.ok) {
                const json = await response.json();
                const posts = json.data?.children?.map((child) => child.data) || [];
                const normalized = posts.map((post) => ({
                    platform: 'reddit',
                    externalId: post.id,
                    author: post.author,
                    text: `${post.title || ''}\n\n${post.selftext || ''}`.trim(),
                    url: `https://reddit.com${post.permalink}`,
                    createdAt: new Date(post.created_utc * 1000).toISOString(),
                    sourceTarget: normalizedSubreddit
                }));
                if (redisClient && normalized.length > 0) {
                    await redisClient.set(cacheKey, JSON.stringify(normalized), 'EX', CACHE_TTL).catch(() => { });
                }
                return { posts: normalized, source: 'rss' };
            }
        }
        catch (jsonErr) {
            console.warn(`[reddit] Public JSON fallback failed for r/${normalizedSubreddit}:`, jsonErr);
        }
    }
    if (providerFailure instanceof Error)
        throw providerFailure;
    throw new Error(`All Reddit fetch paths failed for r/${normalizedSubreddit}`);
}
async function fetchSubredditNew(subreddit, limit = 25) {
    return (await fetchSubredditNewWithSource(subreddit, limit)).posts;
}
