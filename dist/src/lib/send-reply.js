"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRetryableSendError = isRetryableSendError;
exports.processSendReply = processSendReply;
const supabase_js_1 = require("@supabase/supabase-js");
const logger_1 = require("./logger");
const reddit_post_1 = require("./reddit-post");
const bluesky_post_1 = require("./bluesky-post");
const x_post_1 = require("./x-post");
const send_limiter_1 = require("./send-limiter");
const attribution_store_1 = require("./attribution-store");
const automation_audit_1 = require("./automation-audit");
const reddit_delivery_alerts_1 = require("./reddit-delivery-alerts");
const reddit_service_safety_1 = require("./reddit-service-safety");
const auto_send_policy_1 = require("./auto-send-policy");
const reddit_session_1 = require("./reddit-session");
const reddit_community_policy_1 = require("./reddit-community-policy");
const content_freshness_1 = require("./content-freshness");
const reply_similarity_1 = require("./reply-similarity");
const plan_limits_1 = require("./plan-limits");
function getSupabase() {
    return (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function isRetryableSendError(error) {
    return !(error instanceof reddit_post_1.PlatformPostError) || error.retryable;
}
async function cancelQueuedAutoSend(supabase, threadId, reason) {
    const { error } = await supabase
        .from('job_outbox')
        .update({
        status: 'cancelled',
        dispatched_at: new Date().toISOString(),
        last_error: `Automatic delivery cancelled: ${reason}`,
    })
        .eq('thread_id', threadId)
        .eq('kind', 'auto_send')
        .in('status', ['pending', 'dispatched']);
    if (error) {
        logger_1.logger.warn({ error, threadId, reason }, 'Could not record automatic delivery cancellation');
    }
}
async function releaseInstantAutopilotClaim(supabase, userId, threadId) {
    try {
        const { error } = await supabase.rpc('release_instant_autopilot_send', {
            p_user_id: userId,
            p_thread_id: threadId,
        });
        if (error)
            throw error;
    }
    catch (error) {
        // The normal send claim and rate slot still protect the provider. A stale
        // instant claim expires in the database after fifteen minutes.
        logger_1.logger.warn({ error, userId, threadId }, 'Could not release Instant Autopilot claim');
    }
}
async function consumeInstantAutopilotAllowance(supabase, userId, threadId) {
    const { data: consumed, error: consumeError } = await supabase.rpc('consume_instant_autopilot_send', { p_user_id: userId, p_thread_id: threadId });
    if (!consumeError && consumed === true)
        return;
    // Once provider delivery may have happened, fail closed even if the state
    // machine RPC is temporarily unavailable. This prevents a second free send.
    const { error: fallbackError } = await supabase.from('profiles').update({
        auto_send_enabled: false,
        instant_autopilot_used_at: new Date().toISOString(),
        instant_autopilot_claimed_at: null,
        instant_autopilot_claim_thread_id: null,
    }).eq('id', userId);
    if (fallbackError) {
        logger_1.logger.error({ consumeError, fallbackError, userId, threadId }, 'Could not persist Instant Autopilot consumption');
    }
    throw new Error(`Unable to consume Instant Autopilot allowance: ${consumeError?.message ?? 'claim no longer active'}`);
}
async function processSendReply(data, context) {
    const { userId, threadExternalId, threadId, text, platform, triggerType } = data;
    const supabase = getSupabase();
    let maxPerDay;
    let autoSendThreshold = 85;
    let businessProfile = null;
    let redditPolicyDecision = null;
    let redditPostUrl = null;
    let sendCommunity;
    let instantAutopilotClaimed = false;
    if (triggerType === 'auto') {
        const { data: automationProfile, error: profileError } = await supabase
            .from('profiles')
            .select('plan, auto_send_enabled, auto_send_threshold, auto_send_daily_limit, auto_send_platforms, auto_send_communities, business_name, business_url')
            .eq('id', userId)
            .single();
        if (profileError || !automationProfile) {
            throw new Error(`Unable to load automation policy: ${profileError?.message ?? 'profile not found'}`);
        }
        const policyBlock = (0, auto_send_policy_1.queuedAutoSendBlockReason)(automationProfile, platform, data.sourceTarget, { redditDirectPostingEnabled: (0, reddit_post_1.isRedditDirectPostingConfigured)(), xDirectPostingEnabled: (0, x_post_1.isXPostingConfigured)() });
        if (policyBlock) {
            await cancelQueuedAutoSend(supabase, threadId, policyBlock);
            logger_1.logger.info({ jobId: context.jobId, threadId, policyBlock }, 'Skipped auto-send after current policy check');
            return { skipped: true, reason: policyBlock };
        }
        let connectionActive = false;
        if (platform === 'reddit') {
            connectionActive = await (0, reddit_session_1.hasActiveRedditConnection)(userId);
        }
        else {
            const { data: connection, error: connectionError } = await supabase
                .from('platform_connections')
                .select('id')
                .eq('user_id', userId)
                .eq('platform', platform)
                .maybeSingle();
            if (connectionError) {
                throw new Error(`Unable to load automation connection: ${connectionError.message}`);
            }
            connectionActive = Boolean(connection);
        }
        if (!connectionActive) {
            const reason = 'platform_connection_removed';
            await cancelQueuedAutoSend(supabase, threadId, reason);
            logger_1.logger.info({ jobId: context.jobId, threadId, reason }, 'Skipped auto-send after connection check');
            return { skipped: true, reason };
        }
        maxPerDay = Number(automationProfile.auto_send_daily_limit) || 3;
        autoSendThreshold = Number(automationProfile.auto_send_threshold) || 85;
        businessProfile = {
            business_name: automationProfile.business_name,
            business_url: automationProfile.business_url,
            plan: automationProfile.plan,
        };
    }
    if (platform === 'reddit') {
        if (!businessProfile) {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('business_name, business_url, plan')
                .eq('id', userId)
                .single();
            if (profileError || !profile?.business_name) {
                throw new Error(`Unable to load Reddit policy profile: ${profileError?.message ?? 'profile not found'}`);
            }
            businessProfile = profile;
        }
        const { data: policyThread, error: policyThreadError } = await supabase
            .from('monitored_threads')
            .select('url, intent_score, source_created_at, created_at')
            .eq('id', threadId)
            .eq('user_id', userId)
            .single();
        if (policyThreadError || !policyThread) {
            throw new Error(`Unable to load Reddit thread for policy check: ${policyThreadError?.message ?? 'thread not found'}`);
        }
        redditPostUrl = policyThread.url;
        const subreddit = (0, reddit_community_policy_1.extractSubredditFromRedditUrl)(policyThread.url) || data.sourceTarget;
        sendCommunity = subreddit || undefined;
        if (triggerType === 'auto') {
            if (!Number.isFinite(Number(policyThread.intent_score)) || Number(policyThread.intent_score) < autoSendThreshold) {
                const reason = 'intent_score_below_current_auto_send_threshold';
                await cancelQueuedAutoSend(supabase, threadId, reason);
                return { skipped: true, reason };
            }
            const freshness = (0, content_freshness_1.evaluateContentFreshness)(policyThread.source_created_at || policyThread.created_at, { maxAgeMs: content_freshness_1.AUTO_REPLY_MAX_AGE_MS });
            if (freshness.fresh === false) {
                const reason = freshness.reason === 'source_too_old'
                    ? 'source_post_outside_auto_reply_window'
                    : 'source_post_time_unverified';
                await cancelQueuedAutoSend(supabase, threadId, reason);
                return { skipped: true, reason };
            }
            const { data: recentReplies, error: recentRepliesError } = await supabase
                .from('reply_analytics')
                .select('draft_text, edited_text')
                .eq('user_id', userId)
                .eq('was_sent', true)
                .order('sent_at', { ascending: false })
                .limit(25);
            if (recentRepliesError) {
                throw new Error(`Unable to run duplicate reply safety check: ${recentRepliesError.message}`);
            }
            if ((recentReplies ?? []).some(reply => (0, reply_similarity_1.areRepliesNearDuplicate)(text, reply.edited_text || reply.draft_text || ''))) {
                const reason = 'near_duplicate_reply_requires_review';
                await cancelQueuedAutoSend(supabase, threadId, reason);
                return { skipped: true, reason };
            }
        }
        const communityPolicy = await (0, reddit_community_policy_1.getSubredditCommunityPolicy)(userId, subreddit ?? '', {
            // This is the final gate immediately before provider delivery. It must
            // not rely on a stale decision made while the draft was created.
            forceRefresh: true,
        });
        redditPolicyDecision = (0, reddit_community_policy_1.evaluateRedditReplyPolicy)(communityPolicy, {
            text,
            businessName: businessProfile.business_name,
            businessUrl: businessProfile.business_url,
        });
        if (redditPolicyDecision.outcome !== 'auto_send_allowed') {
            await (0, automation_audit_1.recordEngagementEvent)(supabase, {
                userId,
                threadId,
                eventType: 'automation_evaluated',
                platform,
                source: 'reddit_community_policy',
                metadata: (0, reddit_community_policy_1.toCommunityPolicyAudit)(redditPolicyDecision),
                idempotencyKey: `${threadId}:reddit-policy:${redditPolicyDecision.policy.checkedAt}`,
            }).catch((auditError) => {
                logger_1.logger.warn({ auditError, threadId }, 'Could not record Reddit community policy decision');
            });
            if (triggerType === 'auto'
                && redditPolicyDecision.outcome === 'manual_review_required') {
                await cancelQueuedAutoSend(supabase, threadId, redditPolicyDecision.reason);
                logger_1.logger.info({ jobId: context.jobId, threadId, reason: redditPolicyDecision.reason }, 'Skipped auto-send after Reddit community policy check');
                return { skipped: true, reason: redditPolicyDecision.reason };
            }
            if (redditPolicyDecision.outcome === 'blocked') {
                throw new reddit_post_1.PlatformPostError('reddit', redditPolicyDecision.message, false);
            }
            logger_1.logger.info({ jobId: context.jobId, threadId, reason: redditPolicyDecision.reason }, 'Proceeding with explicitly approved manual Reddit reply after policy review');
        }
    }
    if (triggerType === 'auto') {
        const { data: instantClaim, error: instantClaimError } = await supabase.rpc('claim_instant_autopilot_send', { p_user_id: userId, p_thread_id: threadId });
        if (instantClaimError) {
            throw new Error(`Unable to verify Instant Autopilot allowance: ${instantClaimError.message}`);
        }
        if (instantClaim === 'unavailable') {
            const reason = 'instant_autopilot_allowance_unavailable';
            await cancelQueuedAutoSend(supabase, threadId, reason);
            return { skipped: true, reason };
        }
        instantAutopilotClaimed = instantClaim === 'claimed';
    }
    const reservation = await (0, send_limiter_1.reserveSendSlot)(userId, platform, {
        maxPerDay,
        ...(triggerType === 'auto' && platform === 'reddit'
            ? {
                minimumGapSeconds: 30 * 60,
                community: sendCommunity,
                communityGapSeconds: 12 * 60 * 60,
            }
            : {}),
    });
    if ('reason' in reservation) {
        if (instantAutopilotClaimed) {
            await releaseInstantAutopilotClaim(supabase, userId, threadId);
        }
        throw new reddit_post_1.PlatformPostError(platform, `Rate limited until ${new Date(reservation.reset).toISOString()}: ${reservation.reason}`, true);
    }
    const { data: claimToken, error: claimError } = await supabase.rpc('claim_thread_for_send_v2', {
        p_thread_id: threadId,
        p_user_id: userId,
    });
    if (claimError) {
        await (0, send_limiter_1.releaseSendSlot)(userId, platform, reservation.token).catch(() => undefined);
        if (instantAutopilotClaimed) {
            await releaseInstantAutopilotClaim(supabase, userId, threadId);
        }
        throw new Error(`Unable to claim reply: ${claimError.message}`);
    }
    if (!claimToken) {
        await (0, send_limiter_1.releaseSendSlot)(userId, platform, reservation.token).catch(() => undefined);
        if (instantAutopilotClaimed) {
            await releaseInstantAutopilotClaim(supabase, userId, threadId);
        }
        logger_1.logger.info({ jobId: context.jobId, threadId }, 'Reply already sent or no longer sendable');
        return { duplicate: true };
    }
    let externalSendSucceeded = false;
    let externalPermalink = null;
    try {
        const { data: threadRow, error: threadError } = await supabase
            .from('monitored_threads')
            .select('tracking_sid')
            .eq('id', threadId)
            .eq('user_id', userId)
            .single();
        if (threadError)
            throw new Error(`Unable to load tracking state: ${threadError.message}`);
        if (threadRow.tracking_sid) {
            const profile = businessProfile ?? await (async () => {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('business_name, business_url, plan')
                    .eq('id', userId)
                    .single();
                if (error || !data)
                    throw new Error(`Unable to load attribution destination: ${error?.message ?? 'profile not found'}`);
                return data;
            })();
            if ((0, plan_limits_1.getPlanLimits)(profile.plan).replyAttribution) {
                if (!profile.business_url)
                    throw new Error('Attribution is enabled but no business URL is configured');
                await (0, attribution_store_1.ensureAttributionMapping)(supabase, {
                    userId,
                    threadId,
                    token: threadRow.tracking_sid,
                    businessUrl: profile.business_url,
                });
            }
        }
        const result = platform === 'reddit'
            ? await (0, reddit_post_1.postRedditReply)({
                userId,
                threadExternalId,
                postUrl: redditPostUrl ?? '',
                text,
                triggerType,
            })
            : platform === 'bluesky'
                ? await (0, bluesky_post_1.postBlueskyReply)(userId, threadExternalId, text)
                : await (0, x_post_1.postXReply)(userId, threadExternalId, text);
        externalSendSucceeded = true;
        externalPermalink = result.permalink;
        if (instantAutopilotClaimed) {
            await consumeInstantAutopilotAllowance(supabase, userId, threadId);
        }
        await (0, send_limiter_1.recordSuccessfulSend)(userId, platform, reservation.token, { community: sendCommunity });
        const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_successful_send', {
            p_thread_id: threadId,
            p_user_id: userId,
            p_claim_token: claimToken,
            p_platform: platform,
            p_trigger_type: triggerType,
            p_permalink: result.permalink,
        });
        if (finalizeError || finalized !== true) {
            throw new Error(`Unable to finalize successful send: ${finalizeError?.message ?? 'claim no longer active'}`);
        }
        await (0, automation_audit_1.recordEngagementEvent)(supabase, {
            userId,
            threadId,
            eventType: 'reply_sent',
            platform,
            actorType: 'provider',
            source: triggerType === 'auto'
                ? (instantAutopilotClaimed ? 'instant_autopilot' : 'earned_automation')
                : 'manual_approval',
            metadata: {
                triggerType,
                permalink: result.permalink,
                ...((0, reddit_community_policy_1.toCommunityPolicyAudit)(redditPolicyDecision) ? { communityPolicy: (0, reddit_community_policy_1.toCommunityPolicyAudit)(redditPolicyDecision) } : {}),
            },
            idempotencyKey: `${threadId}:reply-sent`,
        }).catch((auditError) => {
            logger_1.logger.warn({ auditError, threadId }, 'Reply sent but engagement audit was not recorded');
        });
        await (0, reddit_service_safety_1.resolveReplyNotSentIncident)(userId).catch((incidentError) => {
            logger_1.logger.warn({ incidentError, threadId }, 'Could not resolve prior reply failure notice');
        });
        return { success: true, permalink: result.permalink };
    }
    catch (error) {
        const deliveryUncertain = error instanceof reddit_post_1.PlatformPostError && error.deliveryUncertain;
        if (externalSendSucceeded || deliveryUncertain) {
            // A timed-out write may still have reached Reddit. Consume the rate-limit
            // slot pessimistically so an uncertain outcome cannot be followed by a
            // burst while reconciliation determines what actually happened.
            await (0, send_limiter_1.recordSuccessfulSend)(userId, platform, reservation.token, { community: sendCommunity }).catch(() => undefined);
            if (instantAutopilotClaimed && !externalSendSucceeded) {
                await consumeInstantAutopilotAllowance(supabase, userId, threadId)
                    .catch((consumeError) => {
                    logger_1.logger.warn({ consumeError, userId, threadId }, 'Uncertain delivery consumed Instant Autopilot through fail-closed fallback');
                });
            }
            await supabase.rpc('mark_send_reconciliation', {
                p_thread_id: threadId,
                p_user_id: userId,
                p_claim_token: claimToken,
                p_platform: platform,
                p_trigger_type: triggerType,
                p_permalink: externalPermalink,
                p_error_message: error instanceof Error
                    ? error.message
                    : 'Post-send persistence error',
            });
            if (deliveryUncertain)
                context.discard?.();
            throw error;
        }
        await (0, send_limiter_1.releaseSendSlot)(userId, platform, reservation.token).catch(() => undefined);
        if (instantAutopilotClaimed) {
            await releaseInstantAutopilotClaim(supabase, userId, threadId);
        }
        const retryable = isRetryableSendError(error);
        const finalAttempt = !retryable || context.attempt >= context.maxAttempts;
        const { data: released, error: releaseError } = await supabase.rpc('release_send_claim', {
            p_thread_id: threadId,
            p_user_id: userId,
            p_claim_token: claimToken,
        });
        if (releaseError || released !== true) {
            throw new Error(`Unable to release failed send claim: ${releaseError?.message ?? 'claim no longer active'}`);
        }
        if (finalAttempt) {
            if (!retryable)
                context.discard?.();
            await supabase.from('send_audit_log').insert({
                user_id: userId,
                thread_id: threadId,
                platform,
                trigger_type: triggerType,
                status: retryable ? 'failed_retryable' : 'failed_permanent',
                error_message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown send error',
            });
            await (0, automation_audit_1.recordEngagementEvent)(supabase, {
                userId,
                threadId,
                eventType: 'reply_failed',
                platform,
                actorType: 'provider',
                source: triggerType === 'auto'
                    ? (instantAutopilotClaimed ? 'instant_autopilot' : 'earned_automation')
                    : 'manual_approval',
                metadata: {
                    triggerType,
                    retryable,
                    error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown send error',
                },
                idempotencyKey: `${threadId}:reply-failed:${context.attempt}`,
            }).catch((auditError) => {
                logger_1.logger.warn({ auditError, threadId }, 'Reply failure audit was not recorded');
            });
            // A final failure changes the user's work and needs a concise, durable
            // alert. Uncertain and reconnect states already have their own specific
            // incidents, so do not stack a second generic warning on top of them.
            const hasSpecificCustomerAlert = error instanceof reddit_post_1.PlatformPostError
                && (error.deliveryUncertain || error.reconnectRequired);
            if (!hasSpecificCustomerAlert) {
                await (0, reddit_delivery_alerts_1.sendRedditDeliveryAlert)({
                    kind: 'repeated_failures',
                    code: 'reply_not_sent',
                    userId,
                    actionPath: `/dashboard?thread=${encodeURIComponent(threadId)}`,
                }).catch((alertError) => {
                    logger_1.logger.warn({ alertError, threadId }, 'Reply failure customer alert was not recorded');
                });
            }
        }
        throw error;
    }
}
