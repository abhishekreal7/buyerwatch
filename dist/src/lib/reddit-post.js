"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformPostError = void 0;
exports.isRedditDirectPostingConfigured = isRedditDirectPostingConfigured;
exports.postRedditReply = postRedditReply;
const env_1 = require("./env");
const content_freshness_1 = require("./content-freshness");
const redditapis_client_1 = require("./redditapis-client");
const redditapis_contract_1 = require("./redditapis-contract");
const hyperbrowser_reddit_1 = require("./hyperbrowser-reddit");
const reddit_session_1 = require("./reddit-session");
const sprinklr_client_1 = require("./sprinklr-client");
const reddit_delivery_alerts_1 = require("./reddit-delivery-alerts");
const reddit_service_safety_1 = require("./reddit-service-safety");
class PlatformPostError extends Error {
    platform;
    responseBody;
    retryable;
    deliveryUncertain;
    reconnectRequired;
    constructor(platform, responseBody, retryable, options = {}) {
        super(`Failed to post to ${platform}: ${responseBody}`);
        this.platform = platform;
        this.responseBody = responseBody;
        this.retryable = retryable;
        this.name = 'PlatformPostError';
        this.deliveryUncertain = options.deliveryUncertain === true;
        this.reconnectRequired = options.reconnectRequired === true;
    }
}
exports.PlatformPostError = PlatformPostError;
function isRedditDirectPostingConfigured() {
    return (0, env_1.hasRedditPostingProvider)();
}
function normalizeExternalPostId(value) {
    const normalized = value.trim().replace(/^t3_/i, '').toLowerCase();
    return /^[a-z0-9]{5,12}$/i.test(normalized) ? normalized : null;
}
function connectionError(error) {
    return new PlatformPostError('reddit', error.code, false, {
        reconnectRequired: error.code === 'reddit_reconnect_required',
    });
}
function providerError(error) {
    return new PlatformPostError('reddit', error.code, error.retryable, {
        deliveryUncertain: error.deliveryUncertain,
        reconnectRequired: error.reauthRequired,
    });
}
function sprinklrProviderError(error) {
    return new PlatformPostError('reddit', error.code, error.retryable, {
        deliveryUncertain: error.deliveryUncertain,
    });
}
function hyperbrowserProviderError(error) {
    return new PlatformPostError('reddit', error.code, error.retryable, {
        deliveryUncertain: error.deliveryUncertain,
        reconnectRequired: error.reauthRequired,
    });
}
function isHyperbrowserProviderError(error) {
    if (!(error instanceof Error) || error.name !== 'HyperbrowserRedditError')
        return false;
    const candidate = error;
    return typeof candidate.code === 'string'
        && typeof candidate.retryable === 'boolean'
        && typeof candidate.deliveryUncertain === 'boolean'
        && typeof candidate.reauthRequired === 'boolean';
}
function boundedIntegerEnvironment(name, fallback, minimum, maximum) {
    const parsed = Number(process.env[name]);
    return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
async function postRedditReply(input) {
    if (!isRedditDirectPostingConfigured()) {
        throw new PlatformPostError('reddit', 'reddit_direct_posting_unavailable', false);
    }
    const postingProvider = (0, env_1.getRedditPostingProviderKind)();
    if (!postingProvider) {
        throw new PlatformPostError('reddit', 'reddit_direct_posting_unavailable', false);
    }
    try {
        await (0, reddit_service_safety_1.assertRedditDeliveryCircuitClosed)();
    }
    catch (error) {
        if (error instanceof reddit_service_safety_1.RedditDeliveryCircuitOpenError) {
            throw new PlatformPostError('reddit', error.code, false);
        }
        throw error;
    }
    const target = (0, redditapis_contract_1.parseRedditPostTarget)(input.postUrl);
    const expectedPostId = normalizeExternalPostId(input.threadExternalId);
    if (!target || !expectedPostId || target.postId !== expectedPostId) {
        throw new PlatformPostError('reddit', 'reddit_post_identity_mismatch', false);
    }
    let session;
    try {
        session = await (0, reddit_session_1.getActiveRedditSession)(input.userId);
    }
    catch (error) {
        if (error instanceof reddit_session_1.RedditConnectionStateError)
            throw connectionError(error);
        throw error;
    }
    if (session.provider !== postingProvider) {
        throw new PlatformPostError('reddit', 'reddit_reconnect_required', false, {
            reconnectRequired: true,
        });
    }
    if (input.triggerType === 'auto'
        && (session.provider === 'redditapis' || session.provider === 'hyperbrowser')) {
        const minimumAgeDays = boundedIntegerEnvironment('REDDIT_AUTO_MIN_ACCOUNT_AGE_DAYS', 30, 7, 365);
        const minimumKarma = boundedIntegerEnvironment('REDDIT_AUTO_MIN_COMBINED_KARMA', 50, 0, 100_000);
        let safetyProfile = {
            accountCreatedAt: session.accountCreatedAt,
            linkKarma: session.linkKarma,
            commentKarma: session.commentKarma,
        };
        if (!safetyProfile.accountCreatedAt
            || safetyProfile.linkKarma === null
            || safetyProfile.commentKarma === null) {
            try {
                const refreshed = session.provider === 'hyperbrowser'
                    ? await (0, hyperbrowser_reddit_1.fetchHyperbrowserRedditAccountProfile)({
                        username: session.username,
                        profileId: session.profileId,
                    })
                    : await (0, redditapis_client_1.fetchRedditAccountProfile)(session.username);
                safetyProfile = {
                    accountCreatedAt: refreshed.createdAt,
                    linkKarma: refreshed.linkKarma,
                    commentKarma: refreshed.commentKarma,
                };
                await (0, reddit_session_1.updateRedditConnectionAccountProfile)(input.userId, safetyProfile);
            }
            catch {
                throw new PlatformPostError('reddit', 'reddit_account_safety_profile_unavailable', false);
            }
        }
        const accountCreatedAt = Date.parse(safetyProfile.accountCreatedAt ?? '');
        if (!Number.isFinite(accountCreatedAt)) {
            throw new PlatformPostError('reddit', 'reddit_account_age_unverified', false);
        }
        if (Date.now() - accountCreatedAt < minimumAgeDays * 24 * 60 * 60_000) {
            throw new PlatformPostError('reddit', 'reddit_account_too_new_for_automation', false);
        }
        const combinedKarma = (safetyProfile.linkKarma ?? 0) + (safetyProfile.commentKarma ?? 0);
        if (safetyProfile.linkKarma === null || safetyProfile.commentKarma === null || combinedKarma < minimumKarma) {
            throw new PlatformPostError('reddit', 'reddit_account_karma_below_automation_minimum', false);
        }
    }
    // A persisted Hyperbrowser profile must not be opened in two immediate,
    // separate sessions for the same delivery. Reddit can rotate auth cookies
    // during the inspection session and Hyperbrowser persistence is eventually
    // consistent, making the following write session appear logged out. The
    // provider validates the exact post and all delivery safety gates before it
    // clicks, so inspection and posting stay atomic in one browser session.
    if (session.provider === 'hyperbrowser') {
        try {
            const result = await (0, hyperbrowser_reddit_1.postHyperbrowserRedditReply)({
                postUrl: target.canonicalUrl,
                text: input.text,
                username: session.username,
                profileId: session.profileId,
                triggerType: input.triggerType,
            });
            await (0, reddit_session_1.markRedditConnectionHealthy)(input.userId);
            return { permalink: result.permalink };
        }
        catch (error) {
            if (isHyperbrowserProviderError(error)) {
                let consecutiveFailures = 0;
                if (error.reauthRequired) {
                    await (0, reddit_session_1.markRedditConnectionReauthRequired)(input.userId, error.code).catch(() => undefined);
                }
                else {
                    consecutiveFailures = await (0, reddit_session_1.recordRedditConnectionFailure)(input.userId, error.code)
                        .catch(() => 0);
                }
                await (0, reddit_delivery_alerts_1.alertRedditDeliveryFailure)({
                    userId: input.userId,
                    code: error.code,
                    reauthRequired: error.reauthRequired,
                    deliveryUncertain: error.deliveryUncertain,
                    consecutiveFailures,
                }).catch(() => undefined);
                throw hyperbrowserProviderError(error);
            }
            throw error;
        }
    }
    let post;
    try {
        if (session.provider === 'sprinklr') {
            post = await (0, sprinklr_client_1.fetchSprinklrRedditPostSnapshot)(target.canonicalUrl);
        }
        else {
            post = await (0, redditapis_client_1.fetchRedditPostSnapshot)(target.canonicalUrl);
        }
    }
    catch (error) {
        if (error instanceof redditapis_client_1.RedditApisRequestError)
            throw providerError(error);
        if (error instanceof sprinklr_client_1.SprinklrRequestError)
            throw sprinklrProviderError(error);
        if (isHyperbrowserProviderError(error)) {
            if (error.reauthRequired) {
                await (0, reddit_session_1.markRedditConnectionReauthRequired)(input.userId, error.code).catch(() => undefined);
            }
            else {
                await (0, reddit_session_1.recordRedditConnectionFailure)(input.userId, error.code).catch(() => undefined);
            }
            throw hyperbrowserProviderError(error);
        }
        throw error;
    }
    if (post.id !== expectedPostId || post.subreddit.toLowerCase() !== target.subreddit.toLowerCase()) {
        throw new PlatformPostError('reddit', 'reddit_post_identity_mismatch', false);
    }
    if (post.locked === true) {
        throw new PlatformPostError('reddit', 'reddit_post_locked', false);
    }
    if (!post.author) {
        throw new PlatformPostError('reddit', 'reddit_post_author_unverified', false);
    }
    if (post.author.toLowerCase() === session.username.toLowerCase()) {
        throw new PlatformPostError('reddit', 'reddit_self_reply_blocked', false);
    }
    if (post.author === '[deleted]' || post.author.toLowerCase() === 'automoderator') {
        throw new PlatformPostError('reddit', 'reddit_non_actionable_author', false);
    }
    if (input.triggerType === 'auto'
        && (post.locked === null || post.stickied === null || post.over18 === null)) {
        throw new PlatformPostError('reddit', 'reddit_post_moderation_state_unverified', false);
    }
    if (input.triggerType === 'auto' && post.stickied) {
        throw new PlatformPostError('reddit', 'reddit_stickied_post_requires_review', false);
    }
    if (input.triggerType === 'auto' && post.over18) {
        throw new PlatformPostError('reddit', 'reddit_nsfw_post_requires_review', false);
    }
    if (input.triggerType === 'auto') {
        const freshness = (0, content_freshness_1.evaluateContentFreshness)(post.createdAt, {
            maxAgeMs: content_freshness_1.AUTO_REPLY_MAX_AGE_MS,
        });
        if (freshness.fresh === false) {
            throw new PlatformPostError('reddit', freshness.reason === 'source_too_old'
                ? 'reddit_post_outside_reply_window'
                : 'reddit_post_age_unverified', false);
        }
    }
    try {
        const result = session.provider === 'sprinklr'
            ? await (0, sprinklr_client_1.postSprinklrRedditReply)({
                postUrl: target.canonicalUrl,
                text: input.text,
                accountId: session.accountId,
                channelId: session.channelId,
            })
            : await (0, redditapis_client_1.postRedditApisComment)({
                postUrl: target.canonicalUrl,
                text: input.text,
                cookies: session.cookies,
            });
        await (0, reddit_session_1.markRedditConnectionHealthy)(input.userId);
        return { permalink: result.permalink };
    }
    catch (error) {
        if (error instanceof redditapis_client_1.RedditApisRequestError) {
            if (error.reauthRequired) {
                await (0, reddit_session_1.markRedditConnectionReauthRequired)(input.userId, error.code).catch(() => undefined);
            }
            else {
                await (0, reddit_session_1.recordRedditConnectionFailure)(input.userId, error.code).catch(() => undefined);
            }
            throw providerError(error);
        }
        if (error instanceof sprinklr_client_1.SprinklrRequestError) {
            await (0, reddit_session_1.recordRedditConnectionFailure)(input.userId, error.code).catch(() => undefined);
            throw sprinklrProviderError(error);
        }
        if (isHyperbrowserProviderError(error)) {
            if (error.reauthRequired) {
                await (0, reddit_session_1.markRedditConnectionReauthRequired)(input.userId, error.code).catch(() => undefined);
            }
            else {
                await (0, reddit_session_1.recordRedditConnectionFailure)(input.userId, error.code).catch(() => undefined);
            }
            throw hyperbrowserProviderError(error);
        }
        throw error;
    }
}
