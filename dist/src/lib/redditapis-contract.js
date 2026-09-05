"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedditApisContractError = void 0;
exports.normalizeRedditUsername = normalizeRedditUsername;
exports.parseRedditPostTarget = parseRedditPostTarget;
exports.parseRedditCommentIdFromPermalink = parseRedditCommentIdFromPermalink;
exports.parseRedditLoginResponse = parseRedditLoginResponse;
exports.parseRedditCommentResponse = parseRedditCommentResponse;
exports.normalizeRedditApisListingPost = normalizeRedditApisListingPost;
exports.parseRedditApisListingPage = parseRedditApisListingPage;
exports.parseRedditApisListing = parseRedditApisListing;
exports.parseRedditDirectCommentReplies = parseRedditDirectCommentReplies;
exports.providerMessageSignalsExpiredSession = providerMessageSignalsExpiredSession;
const REDDIT_USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const REDDIT_POST_ID_PATTERN = /^[a-z0-9]{5,12}$/i;
const REDDIT_COMMENT_ID_PATTERN = /^t1_[a-z0-9]+$/i;
const MAX_COOKIE_LENGTH = 32_768;
const OPTIONAL_COOKIE_NAMES = [
    'token_v2',
    'csrf_token',
    'edgebucket',
    'csv',
    'session_tracker',
    'pc',
];
class RedditApisContractError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'RedditApisContractError';
    }
}
exports.RedditApisContractError = RedditApisContractError;
function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function boundedString(value, maximum = MAX_COOKIE_LENGTH) {
    if (typeof value !== 'string')
        return '';
    const trimmed = value.trim();
    return trimmed.length <= maximum ? trimmed : '';
}
function finiteInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
}
function safeRedditUrl(value) {
    if (typeof value !== 'string')
        return null;
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        if (url.protocol !== 'https:'
            || !(hostname === 'reddit.com' || hostname.endsWith('.reddit.com')))
            return null;
        return url.toString();
    }
    catch {
        return null;
    }
}
function normalizeRedditUsername(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().replace(/^u\//i, '');
    return REDDIT_USERNAME_PATTERN.test(normalized) ? normalized : null;
}
function parseRedditPostTarget(value) {
    const safeUrl = safeRedditUrl(value);
    if (!safeUrl)
        return null;
    const url = new URL(safeUrl);
    const match = url.pathname.match(/^\/r\/([a-z0-9_]{2,50})\/comments\/([a-z0-9]{5,12})(?:\/|$)/i);
    if (!match || !REDDIT_POST_ID_PATTERN.test(match[2]))
        return null;
    const subreddit = match[1];
    const postId = match[2].toLowerCase();
    return {
        subreddit,
        postId,
        canonicalUrl: `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/comments/${postId}/`,
    };
}
/**
 * Extracts a comment identity only from a canonical Reddit comment permalink.
 * A post URL is deliberately not treated as a comment: tracking must never
 * claim a conversation from a reply we cannot prove BuyerWatch posted.
 */
function parseRedditCommentIdFromPermalink(value) {
    const safeUrl = safeRedditUrl(value);
    if (!safeUrl)
        return null;
    const segments = new URL(safeUrl).pathname.split('/').filter(Boolean);
    const commentsIndex = segments.findIndex(segment => segment.toLowerCase() === 'comments');
    if (commentsIndex < 0 || !REDDIT_POST_ID_PATTERN.test(segments[commentsIndex + 1] ?? '')) {
        return null;
    }
    const explicitCommentIndex = segments.findIndex(segment => segment.toLowerCase() === 'comment');
    const candidate = explicitCommentIndex >= 0
        ? segments[explicitCommentIndex + 1]
        // Standard Reddit comment links are /comments/<post>/<title>/<comment>/.
        // Requiring both title and comment segments prevents a post URL from being
        // mistaken for a comment URL.
        : segments.length >= commentsIndex + 4
            ? segments.at(-1)
            : null;
    const normalized = boundedString(candidate, 64).toLowerCase().replace(/^t1_/, '');
    return /^[a-z0-9]{3,20}$/i.test(normalized) ? `t1_${normalized}` : null;
}
function parseRedditLoginResponse(payload) {
    const root = asObject(payload);
    if (!root || root.success !== true) {
        throw new RedditApisContractError('reddit_login_rejected');
    }
    const username = normalizeRedditUsername(root.username);
    const rawCookies = asObject(root.cookies);
    const redditSession = boundedString(rawCookies?.reddit_session);
    const loid = boundedString(rawCookies?.loid);
    if (!username || !rawCookies || !redditSession || !loid) {
        throw new RedditApisContractError('reddit_login_response_invalid');
    }
    const cookies = {
        reddit_session: redditSession,
        loid,
    };
    for (const name of OPTIONAL_COOKIE_NAMES) {
        const value = boundedString(rawCookies[name]);
        if (value)
            cookies[name] = value;
    }
    return {
        username,
        cookies,
        linkKarma: finiteInteger(root.link_karma),
        commentKarma: finiteInteger(root.comment_karma),
    };
}
function parseRedditCommentResponse(payload) {
    const root = asObject(payload);
    const commentId = boundedString(root?.comment_id, 64);
    const permalink = safeRedditUrl(root?.permalink);
    if (root?.success !== true || !REDDIT_COMMENT_ID_PATTERN.test(commentId) || !permalink) {
        throw new RedditApisContractError('reddit_comment_response_invalid');
    }
    return { commentId, permalink };
}
function normalizeRedditApisListingPost(value) {
    const post = asObject(value);
    if (!post)
        return null;
    const id = boundedString(post.id, 32).toLowerCase();
    const author = boundedString(post.author, 64);
    const subreddit = boundedString(post.subreddit, 64);
    const url = safeRedditUrl(post.url);
    const rawCreated = boundedString(post.created, 64);
    const createdAt = rawCreated && Number.isFinite(Date.parse(rawCreated))
        ? new Date(rawCreated).toISOString()
        : typeof post.created_utc === 'number' && Number.isFinite(post.created_utc)
            ? new Date(post.created_utc * 1_000).toISOString()
            : null;
    if (!REDDIT_POST_ID_PATTERN.test(id) || !author || !subreddit || !url)
        return null;
    return {
        id,
        author,
        subreddit,
        url,
        createdAt,
        locked: post.locked === true,
        stickied: post.stickied === true,
        over18: post.over_18 === true,
    };
}
function parseRedditApisListingPage(payload) {
    const root = asObject(payload);
    const posts = Array.isArray(root?.posts) ? root.posts : [];
    const rawAfter = boundedString(root?.after, 32);
    return {
        posts: posts.flatMap((post) => {
            const normalized = normalizeRedditApisListingPost(post);
            return normalized ? [normalized] : [];
        }),
        after: /^t3_[a-z0-9]{5,12}$/i.test(rawAfter) ? rawAfter : null,
    };
}
function parseRedditApisListing(payload) {
    return parseRedditApisListingPage(payload).posts;
}
function normalizeCommentId(value) {
    const normalized = boundedString(value, 64).toLowerCase().replace(/^t1_/, '');
    return /^[a-z0-9]{3,20}$/i.test(normalized) ? `t1_${normalized}` : null;
}
function normalizeCommentCreatedAt(value) {
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
        return new Date(value).toISOString();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value * 1_000).toISOString();
    }
    return null;
}
/**
 * RedditAPIs returns Reddit "thing" objects, but the wrapping differs between
 * endpoint versions. Traverse only the known comment/listing containers and
 * retain direct children of the posted comment. Nested replies do not start a
 * separate BuyerWatch conversation.
 */
function parseRedditDirectCommentReplies(payload, parentCommentId) {
    const parentId = normalizeCommentId(parentCommentId);
    if (!parentId)
        return [];
    const replies = new Map();
    const visited = new WeakSet();
    let visitedNodes = 0;
    const visit = (value, depth) => {
        if (depth > 10 || visitedNodes > 1_000 || !value || typeof value !== 'object')
            return;
        if (visited.has(value))
            return;
        visited.add(value);
        visitedNodes += 1;
        if (Array.isArray(value)) {
            value.forEach(item => visit(item, depth + 1));
            return;
        }
        const record = value;
        const data = asObject(record.data);
        const comment = data ?? record;
        const commentId = normalizeCommentId(comment.id ?? comment.name);
        const directParentId = normalizeCommentId(comment.parent_id);
        const author = boundedString(comment.author, 128);
        if (commentId && directParentId === parentId && author && author !== '[deleted]') {
            replies.set(commentId, {
                commentId,
                author,
                createdAt: normalizeCommentCreatedAt(comment.created ?? comment.created_utc),
            });
        }
        // These are the only containers used by Reddit listings/comment trees.
        for (const child of [record.children, record.replies, record.comment, data?.children, data?.replies]) {
            visit(child, depth + 1);
        }
    };
    visit(payload, 0);
    return [...replies.values()];
}
function providerMessageSignalsExpiredSession(payload) {
    const root = asObject(payload);
    const message = [root?.error, root?.message, root?.detail]
        .filter((value) => typeof value === 'string')
        .join(' ')
        .toLowerCase();
    return /(?:session|cookie|login|log in|expired|authentication)/.test(message);
}
