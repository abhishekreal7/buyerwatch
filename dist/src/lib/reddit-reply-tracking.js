"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRedditReplyTracker = runRedditReplyTracker;
const admin_1 = require("./admin");
const env_1 = require("./env");
const logger_1 = require("./logger");
const redditapis_client_1 = require("./redditapis-client");
const redditapis_contract_1 = require("./redditapis-contract");
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const MAX_CONCURRENCY = 8;
function batchSize() {
    const raw = Number(process.env.REDDIT_REPLY_TRACKING_BATCH_SIZE);
    return Number.isSafeInteger(raw) && raw >= 1 && raw <= MAX_BATCH_SIZE
        ? raw
        : DEFAULT_BATCH_SIZE;
}
function trackingEnabled() {
    return process.env.REDDIT_REPLY_TRACKING_ENABLED !== 'false'
        && (0, env_1.getRedditDiscoveryProviderKind)() === 'redditapis';
}
function nextCheckAt(sendCreatedAt, now, hasReplies) {
    const ageMs = Math.max(0, now.getTime() - Date.parse(sendCreatedAt));
    const ageHours = ageMs / (60 * 60_000);
    const delayMinutes = hasReplies
        ? 24 * 60
        : ageHours < 24
            ? 2 * 60
            : ageHours < 72
                ? 6 * 60
                : 24 * 60;
    return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}
async function settleClaim(claim, input) {
    const admin = (0, admin_1.getServiceRoleClient)();
    const { data, error } = await admin.rpc('settle_reddit_reply_tracking_v1', {
        p_audit_id: claim.audit_id,
        p_claim_token: claim.claim_token,
        p_checked_at: input.checkedAt ?? null,
        p_next_check_at: input.nextCheckAt,
        p_reply_count: input.replyCount ?? null,
        p_last_error: input.error ?? null,
        p_complete: input.complete ?? false,
    });
    if (error)
        throw error;
    if (data !== true)
        throw new Error('Reddit reply tracking claim is no longer active');
}
async function processClaim(claim, accountNames) {
    const now = new Date();
    const commentId = (0, redditapis_contract_1.parseRedditCommentIdFromPermalink)(claim.permalink);
    if (!commentId) {
        await settleClaim(claim, {
            nextCheckAt: claim.expires_at,
            error: 'invalid_permalink',
            complete: true,
        });
        return { checked: false, conversationStarted: false };
    }
    try {
        const admin = (0, admin_1.getServiceRoleClient)();
        const replies = await (0, redditapis_client_1.fetchRedditCommentReplies)(commentId);
        const ownUsername = accountNames.get(claim.user_id);
        const externalReplies = replies.filter(reply => reply.author.toLowerCase() !== ownUsername);
        const firstReply = externalReplies[0];
        const checkedAt = now.toISOString();
        const { error: eventError } = await admin.from('engagement_events').upsert({
            user_id: claim.user_id,
            thread_id: claim.thread_id,
            event_type: 'reply_confirmed',
            platform: 'reddit',
            actor_type: 'provider',
            source: 'reddit_reply_tracker',
            metadata: {
                direction: 'inbound',
                outboundCommentId: commentId,
                incomingCommentId: firstReply?.commentId ?? null,
                incomingAuthor: firstReply?.author ?? null,
                replyCount: externalReplies.length,
                checkedAt,
            },
            idempotency_key: `conversation-started:${commentId}`,
            occurred_at: firstReply?.createdAt ?? checkedAt,
        }, {
            onConflict: 'user_id,idempotency_key',
            ignoreDuplicates: false,
        });
        if (eventError)
            throw eventError;
        await settleClaim(claim, {
            checkedAt,
            nextCheckAt: nextCheckAt(claim.send_created_at, now, externalReplies.length > 0),
            replyCount: externalReplies.length,
        });
        logger_1.logger.info({ auditId: claim.audit_id, replyCount: externalReplies.length }, 'Reddit reply tracking check completed');
        return { checked: true, conversationStarted: externalReplies.length > 0 };
    }
    catch (error) {
        const code = error instanceof redditapis_client_1.RedditApisRequestError ? error.code : 'reply_tracking_failed';
        const retryDelayMinutes = Math.min(6 * 60, 15 * 2 ** Math.min(claim.attempt_count, 4));
        await settleClaim(claim, {
            nextCheckAt: new Date(now.getTime() + retryDelayMinutes * 60_000).toISOString(),
            error: code,
        }).catch((settleError) => {
            logger_1.logger.error({ settleError, auditId: claim.audit_id }, 'Reddit reply tracking failure could not be rescheduled');
        });
        logger_1.logger.warn({ error, code, auditId: claim.audit_id }, 'Reddit reply tracking check failed');
        return { checked: false, conversationStarted: false };
    }
}
async function runRedditReplyTracker() {
    if (!trackingEnabled())
        return { status: 'disabled' };
    const admin = (0, admin_1.getServiceRoleClient)();
    const { data, error } = await admin.rpc('claim_due_reddit_reply_tracking_v1', {
        p_limit: batchSize(),
    });
    if (error) {
        logger_1.logger.warn({ error }, 'Reddit reply tracker could not claim due work');
        return { status: 'unavailable' };
    }
    const claims = (data ?? []);
    if (claims.length === 0) {
        return { status: 'skipped', claimed: 0, checked: 0, failed: 0, conversationsStarted: 0 };
    }
    const userIds = [...new Set(claims.map(claim => claim.user_id))];
    const { data: connections, error: connectionError } = await admin
        .from('platform_connections')
        .select('user_id, external_username')
        .eq('platform', 'reddit')
        .in('user_id', userIds);
    if (connectionError)
        throw connectionError;
    const accountNames = new Map((connections ?? []).flatMap(connection => {
        const username = connection.external_username?.trim().toLowerCase();
        return username ? [[connection.user_id, username]] : [];
    }));
    const results = [];
    for (let index = 0; index < claims.length; index += MAX_CONCURRENCY) {
        results.push(...await Promise.all(claims.slice(index, index + MAX_CONCURRENCY)
            .map(claim => processClaim(claim, accountNames))));
    }
    const checked = results.filter(result => result.checked).length;
    const conversationsStarted = results.filter(result => result.conversationStarted).length;
    return {
        status: checked > 0 ? 'checked' : 'unavailable',
        claimed: claims.length,
        checked,
        failed: claims.length - checked,
        conversationsStarted,
    };
}
