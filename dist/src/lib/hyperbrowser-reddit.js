"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HyperbrowserRedditError = exports.getHyperbrowserRedditMaxConcurrency = void 0;
exports.getHyperbrowserRedditProfileLockKey = getHyperbrowserRedditProfileLockKey;
exports.isHyperbrowserProfileId = isHyperbrowserProfileId;
exports.getHyperbrowserSessionOptions = getHyperbrowserSessionOptions;
exports.fetchHyperbrowserCreditInfo = fetchHyperbrowserCreditInfo;
exports.parseRedditProfileUsername = parseRedditProfileUsername;
exports.parseShredditPostAttributes = parseShredditPostAttributes;
exports.fetchHyperbrowserRedditPostSnapshot = fetchHyperbrowserRedditPostSnapshot;
exports.fetchHyperbrowserRedditAccountProfile = fetchHyperbrowserRedditAccountProfile;
exports.postHyperbrowserRedditReply = postHyperbrowserRedditReply;
const node_crypto_1 = require("node:crypto");
const sdk_1 = require("@hyperbrowser/sdk");
const playwright_core_1 = require("playwright-core");
const redditapis_contract_1 = require("./redditapis-contract");
const content_freshness_1 = require("./content-freshness");
const reddit_delivery_health_1 = require("./reddit-delivery-health");
const redis_1 = require("./redis");
const redis_lock_1 = require("./redis-lock");
const reddit_delivery_concurrency_1 = require("./reddit-delivery-concurrency");
var reddit_delivery_concurrency_2 = require("./reddit-delivery-concurrency");
Object.defineProperty(exports, "getHyperbrowserRedditMaxConcurrency", { enumerable: true, get: function () { return reddit_delivery_concurrency_2.getHyperbrowserRedditMaxConcurrency; } });
const SESSION_TIMEOUT_MINUTES = 5;
const NAVIGATION_TIMEOUT_MS = 45_000;
const UI_TIMEOUT_MS = 15_000;
const SESSION_LOCK_TTL_MS = 6 * 60_000;
const SESSION_SEMAPHORE_KEY = 'semaphore:hyperbrowser-reddit-session:v1';
const SESSION_QUEUE_WAIT_MS = 20_000;
function getHyperbrowserRedditProfileLockKey(profileId) {
    if (!isHyperbrowserProfileId(profileId)) {
        throw new HyperbrowserRedditError('hyperbrowser_profile_invalid', false);
    }
    const digest = (0, node_crypto_1.createHash)('sha256').update(profileId.trim()).digest('hex').slice(0, 24);
    return `lock:hyperbrowser-reddit-profile:v1:${digest}`;
}
class HyperbrowserRedditError extends Error {
    code;
    retryable;
    deliveryUncertain;
    reauthRequired;
    constructor(code, retryable, deliveryUncertain = false, reauthRequired = false) {
        super(code);
        this.code = code;
        this.retryable = retryable;
        this.deliveryUncertain = deliveryUncertain;
        this.reauthRequired = reauthRequired;
        this.name = 'HyperbrowserRedditError';
    }
}
exports.HyperbrowserRedditError = HyperbrowserRedditError;
function isHyperbrowserProfileId(value) {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}
function getHyperbrowserSessionOptions(profileId) {
    if (!isHyperbrowserProfileId(profileId)) {
        throw new HyperbrowserRedditError('hyperbrowser_profile_invalid', false);
    }
    return {
        useUltraStealth: false,
        useStealth: false,
        useProxy: false,
        solveCaptchas: false,
        adblock: false,
        trackers: false,
        annoyances: false,
        enableWebRecording: false,
        enableVideoWebRecording: false,
        enableLogCapture: false,
        acceptCookies: false,
        saveDownloads: false,
        disablePasswordManager: true,
        timeoutMinutes: SESSION_TIMEOUT_MINUTES,
        profile: {
            id: profileId.trim(),
            // Reddit can rotate authentication cookies. Persisting the rotation keeps
            // the server-side profile usable without storing those cookies here.
            persistChanges: true,
        },
    };
}
function getClient() {
    const apiKey = process.env.HYPERBROWSER_API_KEY?.trim();
    if (!apiKey)
        throw new HyperbrowserRedditError('hyperbrowser_not_configured', false);
    return new sdk_1.Hyperbrowser({ apiKey });
}
function providerFailure(error) {
    if (error instanceof HyperbrowserRedditError)
        return error;
    if (error instanceof sdk_1.HyperbrowserError) {
        const providerAuthenticationFailed = error.statusCode === 401 || error.statusCode === 403;
        const creditsExhausted = error.statusCode === 402;
        return new HyperbrowserRedditError(providerAuthenticationFailed
            ? 'hyperbrowser_authentication_failed'
            : creditsExhausted
                ? 'hyperbrowser_credits_exhausted'
                : 'hyperbrowser_session_unavailable', !providerAuthenticationFailed
            && !creditsExhausted
            && (error.retryable || error.statusCode === 429 || (error.statusCode ?? 0) >= 500), false, false);
    }
    return new HyperbrowserRedditError('hyperbrowser_session_unavailable', true);
}
async function withRedditPage(profileId, operation) {
    try {
        const result = await (0, redis_lock_1.withRedisLock)(redis_1.redis, getHyperbrowserRedditProfileLockKey(profileId), SESSION_LOCK_TTL_MS, async () => (0, redis_lock_1.withRedisSemaphore)(redis_1.redis, SESSION_SEMAPHORE_KEY, (0, reddit_delivery_concurrency_1.getHyperbrowserRedditMaxConcurrency)(), SESSION_LOCK_TTL_MS, async () => {
            const client = getClient();
            let sessionId = null;
            let browser = null;
            try {
                const session = await client.sessions.create(getHyperbrowserSessionOptions(profileId));
                sessionId = session.id;
                browser = await playwright_core_1.chromium.connectOverCDP(session.wsEndpoint, {
                    timeout: NAVIGATION_TIMEOUT_MS,
                });
                const context = browser.contexts()[0];
                if (!context)
                    throw new HyperbrowserRedditError('hyperbrowser_browser_context_missing', true);
                const page = context.pages()[0] ?? await context.newPage();
                page.setDefaultTimeout(UI_TIMEOUT_MS);
                page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
                const value = await operation(page);
                await (0, reddit_delivery_health_1.recordHyperbrowserHealth)({ status: 'ok' }).catch(() => undefined);
                return value;
            }
            finally {
                await browser?.close().catch(() => undefined);
                if (sessionId)
                    await client.sessions.stop(sessionId).catch(() => undefined);
            }
        }, { waitMs: SESSION_QUEUE_WAIT_MS, minRetryDelayMs: 250, maxRetryDelayMs: 900 }), { waitMs: SESSION_QUEUE_WAIT_MS, minRetryDelayMs: 250, maxRetryDelayMs: 900 });
        if (result === null)
            throw new HyperbrowserRedditError('hyperbrowser_session_busy', true);
        return result;
    }
    catch (error) {
        throw providerFailure(error);
    }
}
async function fetchHyperbrowserCreditInfo() {
    try {
        return await getClient().team.getCreditInfo();
    }
    catch (error) {
        throw providerFailure(error);
    }
}
function parseRedditProfileUsername(href) {
    if (typeof href !== 'string')
        return null;
    const match = /^\/user\/([^/]+)\/?$/i.exec(href.trim());
    if (!match)
        return null;
    try {
        return (0, redditapis_contract_1.normalizeRedditUsername)(decodeURIComponent(match[1]));
    }
    catch {
        return null;
    }
}
async function verifyRedditIdentity(page, expectedUsername) {
    const username = (0, redditapis_contract_1.normalizeRedditUsername)(expectedUsername);
    if (!username)
        throw new HyperbrowserRedditError('reddit_username_invalid', false);
    const profileLinks = page
        .locator('a[href^="/user/"]')
        .filter({ hasText: /View Profile/i });
    const readVisibleUsernames = async () => {
        const hrefs = await profileLinks.evaluateAll(elements => elements.map(element => element
            .getAttribute('href'))).catch(() => []);
        return hrefs
            .map(parseRedditProfileUsername)
            .filter((value) => Boolean(value));
    };
    let visibleUsernames = await readVisibleUsernames();
    if (visibleUsernames.length === 0) {
        const menuButton = page
            .locator('button')
            .filter({ hasText: 'Expand user menu', visible: true })
            .first();
        if (!await menuButton.isVisible().catch(() => false)) {
            throw new HyperbrowserRedditError('reddit_reconnect_required', false, false, true);
        }
        // Reddit occasionally schedules background SPA navigation from this
        // control. The menu is already open once the click dispatches, so waiting
        // for that unrelated navigation can turn a successful click into a timeout.
        await menuButton.click({ noWaitAfter: true });
        await profileLinks.first().waitFor({ state: 'attached' }).catch(() => {
            throw new HyperbrowserRedditError('reddit_reconnect_required', false, false, true);
        });
        visibleUsernames = await readVisibleUsernames();
    }
    if (visibleUsernames.length === 0) {
        throw new HyperbrowserRedditError('reddit_reconnect_required', false, false, true);
    }
    if (!visibleUsernames.some(value => value.toLowerCase() === username.toLowerCase())) {
        throw new HyperbrowserRedditError('reddit_account_identity_mismatch', false, false, true);
    }
}
function booleanAttribute(attributes, names) {
    for (const name of names) {
        if (!(name in attributes))
            continue;
        const value = attributes[name].trim().toLowerCase();
        return value !== 'false' && value !== '0';
    }
    return false;
}
function parseShredditPostAttributes(attributes) {
    const id = (attributes.id ?? attributes['post-id'] ?? '').trim().replace(/^t3_/i, '').toLowerCase();
    const subreddit = (attributes['subreddit-prefixed-name'] ?? attributes['subreddit-name'] ?? '')
        .trim()
        .replace(/^r\//i, '');
    const author = (attributes.author ?? '').trim().replace(/^u\//i, '');
    const rawCreatedAt = (attributes['created-timestamp'] ?? attributes['created-at'] ?? '').trim();
    const createdAt = rawCreatedAt && Number.isFinite(Date.parse(rawCreatedAt))
        ? new Date(rawCreatedAt).toISOString()
        : null;
    if (!/^[a-z0-9]{5,12}$/i.test(id) || !/^[a-z0-9_]{2,50}$/i.test(subreddit) || !author) {
        return null;
    }
    return {
        id,
        author,
        subreddit,
        createdAt,
        locked: booleanAttribute(attributes, ['is-locked', 'locked']),
        stickied: booleanAttribute(attributes, ['is-stickied', 'stickied']),
        over18: booleanAttribute(attributes, ['is-nsfw', 'over-18', 'over18']),
    };
}
async function readPostSnapshot(page, target) {
    const post = page.locator(`shreddit-post[id="t3_${target.postId}" i]`).first();
    await post.waitFor({ state: 'attached' });
    const attributes = await post.evaluate((element) => Object.fromEntries(element.getAttributeNames().map(name => [name, element.getAttribute(name) ?? ''])));
    const snapshot = parseShredditPostAttributes(attributes);
    if (!snapshot)
        throw new HyperbrowserRedditError('reddit_post_snapshot_invalid', false);
    if (snapshot.id !== target.postId
        || snapshot.subreddit.toLowerCase() !== target.subreddit.toLowerCase())
        throw new HyperbrowserRedditError('reddit_post_identity_mismatch', false);
    return snapshot;
}
async function openRedditPost(page, target, username) {
    await page.goto(target.canonicalUrl, { waitUntil: 'domcontentloaded' });
    await verifyRedditIdentity(page, username);
    return readPostSnapshot(page, target);
}
async function fetchHyperbrowserRedditPostSnapshot(input) {
    const target = (0, redditapis_contract_1.parseRedditPostTarget)(input.postUrl);
    if (!target)
        throw new HyperbrowserRedditError('reddit_post_url_invalid', false);
    return withRedditPage(input.profileId, page => openRedditPost(page, target, input.username));
}
async function fetchHyperbrowserRedditAccountProfile(input) {
    const username = (0, redditapis_contract_1.normalizeRedditUsername)(input.username);
    if (!username)
        throw new HyperbrowserRedditError('reddit_username_invalid', false);
    return withRedditPage(input.profileId, async (page) => {
        await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' });
        await verifyRedditIdentity(page, username);
        const payload = await page.evaluate(async (requestedUsername) => {
            const response = await fetch(`/user/${encodeURIComponent(requestedUsername)}/about.json`, {
                credentials: 'include',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok)
                return null;
            return response.json();
        }, username);
        const data = payload && typeof payload === 'object' && !Array.isArray(payload)
            ? payload.data
            : null;
        const profile = data && typeof data === 'object' && !Array.isArray(data)
            ? data
            : null;
        const returnedUsername = (0, redditapis_contract_1.normalizeRedditUsername)(profile?.name);
        const createdUtc = Number(profile?.created_utc);
        const linkKarma = Number(profile?.link_karma);
        const commentKarma = Number(profile?.comment_karma);
        if (!returnedUsername
            || returnedUsername.toLowerCase() !== username.toLowerCase()
            || !Number.isFinite(createdUtc)
            || !Number.isSafeInteger(linkKarma)
            || !Number.isSafeInteger(commentKarma))
            throw new HyperbrowserRedditError('reddit_account_safety_profile_unavailable', false);
        return {
            createdAt: new Date(createdUtc * 1_000).toISOString(),
            linkKarma,
            commentKarma,
        };
    });
}
function confirmedCommentPermalink(href, target) {
    if (!href)
        return null;
    try {
        const url = new URL(href, 'https://www.reddit.com');
        if (url.protocol !== 'https:'
            || !['reddit.com', 'www.reddit.com'].includes(url.hostname.toLowerCase())
            || !url.pathname.toLowerCase().includes(`/comments/${target.postId}/`))
            return null;
        url.hash = '';
        return url.toString();
    }
    catch {
        return null;
    }
}
async function postHyperbrowserRedditReply(input) {
    const target = (0, redditapis_contract_1.parseRedditPostTarget)(input.postUrl);
    const username = (0, redditapis_contract_1.normalizeRedditUsername)(input.username);
    const text = input.text.trim();
    if (!target || !username || !text || text.length > 10_000) {
        throw new HyperbrowserRedditError('reddit_reply_invalid', false);
    }
    return withRedditPage(input.profileId, async (page) => {
        const snapshot = await openRedditPost(page, target, username);
        if (snapshot.locked)
            throw new HyperbrowserRedditError('reddit_post_locked', false);
        if (snapshot.author.toLowerCase() === username.toLowerCase()) {
            throw new HyperbrowserRedditError('reddit_self_reply_blocked', false);
        }
        if (snapshot.author === '[deleted]'
            || snapshot.author.toLowerCase() === 'automoderator')
            throw new HyperbrowserRedditError('reddit_non_actionable_author', false);
        if (input.triggerType === 'auto' && snapshot.stickied) {
            throw new HyperbrowserRedditError('reddit_stickied_post_requires_review', false);
        }
        if (input.triggerType === 'auto' && snapshot.over18) {
            throw new HyperbrowserRedditError('reddit_nsfw_post_requires_review', false);
        }
        if (input.triggerType === 'auto') {
            const freshness = (0, content_freshness_1.evaluateContentFreshness)(snapshot.createdAt, {
                maxAgeMs: content_freshness_1.AUTO_REPLY_MAX_AGE_MS,
            });
            if (freshness.fresh === false) {
                throw new HyperbrowserRedditError(freshness.reason === 'source_too_old'
                    ? 'reddit_post_outside_reply_window'
                    : 'reddit_post_age_unverified', false);
            }
        }
        const composer = page
            .locator('shreddit-composer[placeholder="Join the conversation"]')
            .filter({ visible: true })
            .first();
        if (!await composer.isVisible().catch(() => false)) {
            const trigger = page
                .locator('faceplate-textarea-input[data-testid="trigger-button"]')
                .filter({ visible: true })
                .first();
            try {
                await trigger.waitFor({ state: 'visible' });
                await trigger.click({ noWaitAfter: true });
                await composer.waitFor({ state: 'visible' });
            }
            catch {
                throw new HyperbrowserRedditError('reddit_comment_composer_unavailable', true);
            }
        }
        const editor = composer.locator('[role="textbox"], [contenteditable="true"], textarea').first();
        try {
            await editor.fill(text);
        }
        catch {
            throw new HyperbrowserRedditError('reddit_comment_editor_unavailable', true);
        }
        // Playwright's regex text filter does not match Reddit's slotted button in
        // the current shadow-DOM variant even though its visible label is Comment.
        // The stable slot/type attributes identify the same control directly.
        const submit = composer
            .locator('button[slot="submit-button"][type="submit"], button[type="submit"]')
            .filter({ visible: true })
            .first();
        await submit.waitFor({ state: 'visible' }).catch(() => {
            throw new HyperbrowserRedditError('reddit_comment_submit_unavailable', true);
        });
        if (!await submit.isEnabled()) {
            throw new HyperbrowserRedditError('reddit_comment_submit_unavailable', false);
        }
        let writeStarted = false;
        try {
            writeStarted = true;
            await submit.click({ noWaitAfter: true });
            const ownComment = page
                .locator(`shreddit-comment[author="${username}" i], [thingid^="t1_"][author="${username}" i]`)
                .filter({ hasText: text })
                .first();
            await ownComment.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
            const directPermalink = confirmedCommentPermalink(await ownComment.getAttribute('permalink'), target);
            if (directPermalink)
                return { permalink: directPermalink };
            const linkedPermalink = confirmedCommentPermalink(await ownComment.locator(`a[href*="/comments/${target.postId}/"]`).first().getAttribute('href'), target);
            if (linkedPermalink)
                return { permalink: linkedPermalink };
            throw new HyperbrowserRedditError('hyperbrowser_delivery_outcome_unknown', false, true);
        }
        catch (error) {
            if (error instanceof HyperbrowserRedditError)
                throw error;
            throw new HyperbrowserRedditError(writeStarted ? 'hyperbrowser_delivery_outcome_unknown' : 'reddit_comment_submit_failed', !writeStarted, writeStarted);
        }
    });
}
