"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scorePostHandler = scorePostHandler;
exports.processScorePost = processScorePost;
const logger_1 = require("../../src/lib/logger");
const intent_scorer_1 = require("../../src/lib/intent-scorer");
const draft_reply_1 = require("../../src/lib/draft-reply");
const confidence_engine_1 = require("../../src/lib/confidence-engine");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const attribution_1 = require("../../src/lib/attribution");
const app_url_1 = require("../../src/lib/app-url");
const intent_1 = require("../../src/lib/intent");
const intent_preflight_1 = require("../../src/lib/intent-preflight");
const plan_limits_1 = require("../../src/lib/plan-limits");
const env_1 = require("../../src/lib/env");
const ai_usage_1 = require("../../src/lib/ai-usage");
const ai_settlement_1 = require("../../src/lib/ai-settlement");
const backend_maintenance_1 = require("../../src/lib/backend-maintenance");
const follow_up_outbox_1 = require("../../src/lib/follow-up-outbox");
const automation_audit_1 = require("../../src/lib/automation-audit");
const platform_capabilities_1 = require("../../src/lib/platform-capabilities");
const x_post_1 = require("../../src/lib/x-post");
const score_lock_1 = require("../../src/lib/score-lock");
const reddit_community_policy_1 = require("../../src/lib/reddit-community-policy");
const content_freshness_1 = require("../../src/lib/content-freshness");
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase_1 = require("../lib/supabase");
async function scorePostHandler(job) {
    const payload = job.data;
    const result = await (0, score_lock_1.withScoreLock)(payload.userId, payload.post.externalId, () => processScorePost(payload));
    if (result === null) {
        logger_1.logger.info({ jobId: job.id, userId: payload.userId, externalId: payload.post.externalId }, 'Skipped duplicate score job while another worker owns the score lease');
    }
    return result;
}
async function processScorePost(payload, options = {}) {
    const { userId, keywordId, post } = payload;
    const allowAutoSend = options.allowAutoSend !== false;
    const enqueueFollowUpJobs = options.enqueueFollowUpJobs !== false;
    const providerRetries = options.providerRetries;
    let signalReserved = false;
    let draftReserved = false;
    let draftSpendReservationId = null;
    try {
        // 1. Resume a checkpointed high-intent thread after a worker/provider
        // failure. Completed rows only need their durable outbox dispatched.
        const { data: existing, error: existingError } = await supabase_1.supabaseWorker
            .from('monitored_threads')
            .select('id, keyword_id, intent_score, intent_label, flag, score_reasoning, matched_signals, status, tracking_sid')
            .eq('user_id', userId)
            .eq('platform', post.platform)
            .eq('external_id', post.externalId)
            .maybeSingle();
        if (existingError)
            throw existingError;
        if (existing && existing.status !== 'pending') {
            if (enqueueFollowUpJobs)
                await (0, backend_maintenance_1.dispatchPendingOutbox)(1, existing.id);
            return;
        }
        const freshness = (0, content_freshness_1.evaluateContentFreshness)(post.createdAt);
        if (freshness.fresh === false) {
            if (existing?.id) {
                const { error: staleDeleteError } = await supabase_1.supabaseWorker
                    .from('monitored_threads')
                    .delete()
                    .eq('id', existing.id)
                    .eq('status', 'pending');
                if (staleDeleteError)
                    throw staleDeleteError;
            }
            logger_1.logger.info({
                userId,
                platform: post.platform,
                externalId: post.externalId,
                reason: freshness.reason,
            }, 'Dropped stale source post before scoring');
            return;
        }
        const hasScoringCheckpoint = Boolean(existing
            && existing.intent_score !== null
            && existing.intent_label);
        // 2. Fetch user profile for context and plan
        const { data: extendedProfile } = await supabase_1.supabaseWorker
            .from('profiles')
            .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, competitors, tone_examples, plan, auto_send_enabled, auto_send_threshold, high_intent_threshold, auto_send_platforms, auto_send_communities, auto_send_daily_limit, referral_tracking_enabled, instant_autopilot_activated_at, instant_autopilot_expires_at, instant_autopilot_used_at')
            .eq('id', userId)
            .single();
        let profile = extendedProfile;
        if (!profile) {
            const legacyResult = await supabase_1.supabaseWorker
                .from('profiles')
                .select('business_name, business_description, business_url, business_type, writing_style, competitors, tone_examples, plan, auto_send_enabled, auto_send_threshold, high_intent_threshold, referral_tracking_enabled')
                .eq('id', userId)
                .single();
            if (legacyResult.error)
                throw legacyResult.error;
            profile = legacyResult.data
                ? {
                    ...legacyResult.data,
                    tone_archetype: null,
                    style_guardrails: [],
                    auto_send_platforms: ['bluesky'],
                    auto_send_communities: [],
                    auto_send_daily_limit: 3,
                    high_intent_threshold: 80,
                    instant_autopilot_activated_at: null,
                    instant_autopilot_expires_at: null,
                    instant_autopilot_used_at: null,
                }
                : null;
        }
        if (!profile)
            throw new Error('Profile not found for scoring job');
        const { data: keyword, error: keywordError } = await supabase_1.supabaseWorker
            .from('keywords')
            .select('term')
            .eq('id', keywordId)
            .maybeSingle();
        if (keywordError)
            throw keywordError;
        const plan = (0, plan_limits_1.normalizePlan)(profile.plan);
        const planLimits = (0, plan_limits_1.getPlanLimits)(plan);
        const hasAnthropic = Boolean((0, env_1.getConfiguredSecret)(process.env.ANTHROPIC_API_KEY));
        let scoreResult;
        let evidenceSignals;
        let paidIntentGatePassed = true;
        let intentManualReviewReason = 'preflight_ai_bypassed';
        if (hasScoringCheckpoint && existing) {
            scoreResult = {
                score: Number(existing.intent_score ?? 0),
                label: existing.intent_label,
                flag: existing.flag ?? undefined,
                reasoning: existing.score_reasoning ?? 'Restored from a persisted scoring checkpoint.',
                usage: (0, ai_usage_1.emptyAiUsage)(),
            };
            evidenceSignals = existing.matched_signals ?? [];
        }
        else {
            // 3. Reject irrelevant/promotional posts before reserving a paid signal.
            // A raw keyword hit must never consume a customer's monthly allowance.
            const preflight = (0, intent_preflight_1.evaluateIntentPreflight)(post, profile, {
                keywordTerm: keyword?.term,
            });
            evidenceSignals = preflight.evidenceSignals;
            if (!preflight.isQualifiedCandidate) {
                await saveThread({
                    userId,
                    keywordId,
                    post,
                    intentScore: preflight.score,
                    intentLabel: preflight.label,
                    status: 'dismissed',
                    flag: preflight.flag,
                    reasoning: preflight.reasoning,
                    evidenceSignals,
                    automationReason: 'preflight_rejected',
                });
                logger_1.logger.info({
                    userId,
                    platform: post.platform,
                    externalId: post.externalId,
                    evidenceSignals: evidenceSignals.slice(0, 6),
                }, 'Intent preflight rejected an unqualified candidate');
                return;
            }
            const canProcessSignal = await reserveMonthlySignal(userId, planLimits.threadsPerMonth);
            if (!canProcessSignal) {
                // Make this terminal. Leaving an unscored row pending causes it to sit
                // at the head of the global queue and starve every later candidate.
                const dismissedThread = await saveThread({
                    userId,
                    keywordId,
                    post,
                    intentScore: 0,
                    intentLabel: 'other',
                    status: 'dismissed',
                    reasoning: 'Skipped because the monthly signal allowance is exhausted; this post was not analyzed.',
                    evidenceSignals,
                    automationReason: 'signal_limit_reached',
                });
                await clearUnscoredIntent(dismissedThread.id);
                logger_1.logger.info({ userId, plan }, 'Monthly signal limit reached; candidate dismissed from the scoring queue');
                return;
            }
            signalReserved = true;
            paidIntentGatePassed = !hasAnthropic || preflight.shouldUseAi;
            if (hasAnthropic && preflight.shouldUseAi) {
                // Reserve provider spend and the daily intent allowance atomically.
                const intentSpend = await (0, ai_usage_1.reserveAiSpend)(supabase_1.supabaseWorker, {
                    userId,
                    purpose: 'intent',
                    plan,
                });
                if (!intentSpend) {
                    logger_1.logger.warn({ userId, plan }, 'AI spend cap blocked intent scoring');
                    scoreResult = {
                        score: preflight.score,
                        label: preflight.label,
                        flag: preflight.flag,
                        reasoning: preflight.reasoning,
                        usage: (0, ai_usage_1.emptyAiUsage)(),
                    };
                    paidIntentGatePassed = false;
                    intentManualReviewReason = 'intent_spend_limit_reached';
                }
                else {
                    let canScore;
                    try {
                        canScore = await checkBudget(userId, profile.plan, 'intent');
                    }
                    catch (error) {
                        await safelyReleaseAiSpend(intentSpend.id, { userId, purpose: 'intent' });
                        throw error;
                    }
                    if (!canScore) {
                        await safelyReleaseAiSpend(intentSpend.id, { userId, purpose: 'intent' });
                        logger_1.logger.info({ userId }, 'Daily intent-scoring limit reached; preserving deterministic result');
                        scoreResult = {
                            score: preflight.score,
                            label: preflight.label,
                            flag: preflight.flag,
                            reasoning: preflight.reasoning,
                            usage: (0, ai_usage_1.emptyAiUsage)(),
                        };
                        paidIntentGatePassed = false;
                        intentManualReviewReason = 'intent_plan_limit_reached';
                    }
                    else {
                        // Score intent and reconcile the reservation with actual usage.
                        try {
                            scoreResult = await (0, intent_scorer_1.scoreIntent)(post, profile, {
                                maxRetries: providerRetries,
                                keywordTerm: keyword?.term,
                            });
                            await safelyRecordAiUsage(intentSpend.id, scoreResult.usage, {
                                userId,
                                purpose: 'intent',
                            });
                        }
                        catch (error) {
                            await settleFailedAiSpend(intentSpend.id, error, {
                                userId,
                                purpose: 'intent',
                            });
                            logger_1.logger.warn({ err: error, userId }, 'AI intent scoring failed; preserving deterministic result for manual review');
                            scoreResult = {
                                score: preflight.score,
                                label: preflight.label,
                                flag: preflight.flag,
                                reasoning: preflight.reasoning,
                                usage: (0, ai_usage_1.emptyAiUsage)(),
                            };
                            paidIntentGatePassed = false;
                            intentManualReviewReason = 'intent_provider_failed';
                        }
                    }
                }
            }
            else {
                scoreResult = {
                    score: preflight.score,
                    label: preflight.label,
                    flag: preflight.flag,
                    reasoning: preflight.reasoning,
                    usage: (0, ai_usage_1.emptyAiUsage)(),
                };
                logger_1.logger.info({
                    userId,
                    platform: post.platform,
                    externalId: post.externalId,
                    score: scoreResult.score,
                    label: scoreResult.label,
                    shouldUseAi: preflight.shouldUseAi,
                    evidenceSignals: evidenceSignals.slice(0, 6),
                }, hasAnthropic ? 'Intent preflight skipped paid AI scoring' : 'Intent preflight used deterministic scoring');
            }
        }
        // Save thread early if score is low
        if (scoreResult.score < intent_1.ACTIONABLE_INTENT_THRESHOLD) {
            await saveThread({
                userId,
                keywordId,
                post,
                intentScore: scoreResult.score,
                intentLabel: scoreResult.label,
                status: 'dismissed',
                flag: scoreResult.flag,
                reasoning: scoreResult.reasoning,
                evidenceSignals,
                automationReason: 'low_intent',
            });
            signalReserved = false;
            return;
        }
        if (!paidIntentGatePassed) {
            await saveThread({
                userId,
                keywordId,
                post,
                intentScore: scoreResult.score,
                intentLabel: scoreResult.label,
                status: 'needs_manual_reply',
                flag: scoreResult.flag,
                reasoning: scoreResult.reasoning,
                evidenceSignals,
                automationReason: intentManualReviewReason,
            });
            signalReserved = false;
            return;
        }
        // Persist the paid intent result before drafting. A retry resumes from this
        // checkpoint and never pays to classify the same user/post twice.
        if (!hasScoringCheckpoint) {
            await saveThread({
                userId,
                keywordId,
                post,
                intentScore: scoreResult.score,
                intentLabel: scoreResult.label,
                status: 'pending',
                flag: scoreResult.flag,
                reasoning: scoreResult.reasoning,
                evidenceSignals,
                automationReason: 'draft_pending',
            });
            signalReserved = false;
        }
        if (!hasAnthropic) {
            await saveThread({
                userId,
                keywordId,
                post,
                intentScore: scoreResult.score,
                intentLabel: scoreResult.label,
                status: 'needs_manual_reply',
                flag: scoreResult.flag,
                reasoning: scoreResult.reasoning,
                evidenceSignals,
                automationReason: 'ai_provider_unavailable',
            });
            signalReserved = false;
            return;
        }
        // 5. Atomic budget check for reply drafting
        const draftSpend = await (0, ai_usage_1.reserveAiSpend)(supabase_1.supabaseWorker, {
            userId,
            purpose: 'draft',
            plan,
        });
        if (!draftSpend) {
            logger_1.logger.warn({ userId, plan }, 'AI spend cap blocked reply drafting');
            await saveThread({
                userId,
                keywordId,
                post,
                intentScore: scoreResult.score,
                intentLabel: scoreResult.label,
                status: 'needs_manual_reply',
                flag: scoreResult.flag,
                reasoning: scoreResult.reasoning,
                evidenceSignals,
                automationReason: 'ai_spend_limit_reached',
            });
            signalReserved = false;
            return;
        }
        draftSpendReservationId = draftSpend.id;
        let canDraft;
        try {
            canDraft = await checkBudget(userId, profile.plan, 'draft');
        }
        catch (error) {
            await safelyReleaseAiSpend(draftSpend.id, { userId, purpose: 'draft' });
            throw error;
        }
        if (!canDraft) {
            await safelyReleaseAiSpend(draftSpend.id, { userId, purpose: 'draft' });
            logger_1.logger.info(`[Budget] User ${userId} exceeded reply-draft limit.`);
            // Save as needs manual reply
            await saveThread({
                userId,
                keywordId,
                post,
                intentScore: scoreResult.score,
                intentLabel: scoreResult.label,
                status: 'needs_manual_reply',
                flag: scoreResult.flag,
                reasoning: scoreResult.reasoning,
                evidenceSignals,
                automationReason: 'draft_plan_limit_reached',
            });
            signalReserved = false;
            return;
        }
        draftReserved = true;
        // 6. Draft Reply — generate tracking SID before drafting so Claude can embed it naturally
        const trackingEnabled = profile.referral_tracking_enabled !== false; // default true
        const trackingSid = trackingEnabled ? (0, crypto_1.randomBytes)(5).toString('base64url') : undefined; // ~7-char URL-safe token
        const trackingUrl = trackingEnabled && profile.business_url && trackingSid
            ? (0, attribution_1.buildAttributionShortUrl)((0, app_url_1.getAppUrl)(), trackingSid)
            : undefined;
        let draftResult;
        try {
            draftResult = await (0, draft_reply_1.draftReply)(post, profile, scoreResult.score, trackingUrl, { maxRetries: providerRetries });
            await safelyRecordAiUsage(draftSpend.id, draftResult.usage, {
                userId,
                purpose: 'draft',
            });
        }
        catch (error) {
            await settleFailedAiSpend(draftSpend.id, error, {
                userId,
                purpose: 'draft',
            });
            await safelyReleaseMonthlyDraft(userId, draftSpend.id);
            draftReserved = false;
            logger_1.logger.warn({ err: error, userId }, 'AI drafting failed; routing scored conversation to manual reply');
            await saveThread({
                userId,
                keywordId,
                post,
                intentScore: scoreResult.score,
                intentLabel: scoreResult.label,
                status: 'needs_manual_reply',
                flag: scoreResult.flag,
                reasoning: scoreResult.reasoning,
                evidenceSignals,
                automationReason: 'draft_provider_failed',
            });
            signalReserved = false;
            return;
        }
        const draftText = draftResult.text;
        // 7. Auto-send decision — routed through the single unified gatekeeper.
        //    All safeguards (disclosure, tone, cold-start, confidence threshold)
        //    are enforced inside evaluateAutoSend(). DO NOT inline duplicate logic here.
        const trustEvaluation = await (0, confidence_engine_1.evaluateAutoSend)(userId, post.platform, draftResult, {
            auto_send_enabled: profile.auto_send_enabled,
            auto_send_threshold: profile.auto_send_threshold,
            high_intent_threshold: profile.high_intent_threshold,
            plan: profile.plan ?? 'free',
            instant_autopilot_activated_at: profile.instant_autopilot_activated_at,
            instant_autopilot_expires_at: profile.instant_autopilot_expires_at,
            instant_autopilot_used_at: profile.instant_autopilot_used_at,
        }, post.sourceTarget ?? null, scoreResult.score);
        const capabilities = (0, platform_capabilities_1.getPlatformCapabilities)(post.platform, {
            redditDirectPosting: (0, env_1.hasRedditPostingProvider)(),
            xDirectPosting: (0, x_post_1.isXPostingConfigured)(),
        });
        const platformConnected = post.platform === 'reddit'
            ? Boolean((await supabase_1.supabaseWorker
                .from('reddit_connection_secrets')
                .select('connection_id')
                .eq('user_id', userId)
                .eq('status', 'active')
                .maybeSingle()).data)
            : post.platform === 'bluesky' || post.platform === 'x'
                ? Boolean((await supabase_1.supabaseWorker
                    .from('platform_connections')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('platform', post.platform)
                    .maybeSingle()).data)
                : false;
        const enabledPlatforms = Array.isArray(profile.auto_send_platforms)
            ? profile.auto_send_platforms
            : ['bluesky'];
        const allowedCommunities = Array.isArray(profile.auto_send_communities)
            ? profile.auto_send_communities.map(value => value.trim().toLocaleLowerCase()).filter(Boolean)
            : [];
        const normalizedTarget = (post.sourceTarget ?? '').trim().toLocaleLowerCase();
        let evaluation = trustEvaluation;
        let redditCommunityPolicyDecision = null;
        if (evaluation.approved && !enabledPlatforms.includes(post.platform)) {
            evaluation = blockAutomation(evaluation, 'auto_send_platform_disabled');
        }
        else if (evaluation.approved && capabilities.delivery === 'direct' && !platformConnected) {
            evaluation = blockAutomation(evaluation, 'platform_connection_required');
        }
        else if (evaluation.approved
            && allowedCommunities.length > 0
            && !allowedCommunities.includes(normalizedTarget)) {
            evaluation = blockAutomation(evaluation, 'auto_send_target_out_of_scope');
        }
        else if (evaluation.approved && (!allowAutoSend || capabilities.delivery !== 'direct')) {
            evaluation = blockAutomation(evaluation, 'assisted_delivery_required');
        }
        if (evaluation.approved && post.platform === 'reddit') {
            const communityPolicy = await (0, reddit_community_policy_1.getSubredditCommunityPolicy)(userId, (0, reddit_community_policy_1.extractSubredditFromRedditUrl)(post.url) || post.sourceTarget || '');
            redditCommunityPolicyDecision = (0, reddit_community_policy_1.evaluateRedditReplyPolicy)(communityPolicy, {
                text: draftText,
                businessName: profile.business_name,
                businessUrl: profile.business_url,
            });
            if (redditCommunityPolicyDecision.outcome !== 'auto_send_allowed') {
                evaluation = blockAutomation(evaluation, redditCommunityPolicyDecision.reason);
            }
        }
        if (evaluation.approved
            && capabilities.delivery === 'direct'
            && ['reddit', 'bluesky', 'x'].includes(post.platform)) {
            // All gates cleared — save and enqueue for auto-send
            const autoSendPayload = {
                userId,
                threadExternalId: post.externalId,
                text: draftText,
                platform: post.platform,
                triggerType: 'auto',
                sourceTarget: post.sourceTarget || undefined,
            };
            const thread = await saveThread({
                userId,
                keywordId,
                post,
                intentScore: scoreResult.score,
                intentLabel: scoreResult.label,
                status: 'drafted',
                draftText,
                flag: scoreResult.flag,
                reasoning: scoreResult.reasoning,
                trackingSid,
                evidenceSignals,
                qualityIssues: draftResult.qualityIssues.map(issue => issue.code),
                automationReason: evaluation.reason,
                autoSendPayload,
            });
            signalReserved = false;
            draftReserved = false;
            if (thread) {
                await recordInitialAutomationAudit({
                    userId,
                    threadId: thread.id,
                    post,
                    scoreResult,
                    draftResult,
                    evaluation,
                    deliveryMode: capabilities.delivery,
                    hasAnthropic,
                    redditCommunityPolicyDecision,
                });
            }
            if (thread && enqueueFollowUpJobs) {
                await (0, backend_maintenance_1.dispatchPendingOutbox)(1, thread.id);
                await (0, follow_up_outbox_1.persistAndDispatchFollowUps)({
                    userId,
                    threadId: thread.id,
                    rank: post.url
                        ? { url: post.url, matchedKeyword: post.sourceTarget }
                        : undefined,
                    slack: {
                        postUrl: post.url,
                        postTitle: post.title || post.text?.slice(0, 100),
                        postAuthor: post.author,
                        intentScore: scoreResult.score,
                        draftText,
                        subreddit: post.sourceTarget || 'reddit',
                    },
                });
                logger_1.logger.info({ userId, threadId: thread.id, reason: evaluation.reason, confidence: evaluation.automationConfidence, threshold: evaluation.dynamicThreshold }, 'Enqueued auto-send');
            }
        }
        else {
            // Any gate failed — route to manual review queue
            const thread = await saveThread({
                userId,
                keywordId,
                post,
                intentScore: scoreResult.score,
                intentLabel: scoreResult.label,
                status: 'drafted',
                draftText,
                flag: scoreResult.flag,
                reasoning: scoreResult.reasoning,
                trackingSid,
                evidenceSignals,
                qualityIssues: draftResult.qualityIssues.map(issue => issue.code),
                automationReason: evaluation.reason,
            });
            signalReserved = false;
            draftReserved = false;
            if (thread) {
                await recordInitialAutomationAudit({
                    userId,
                    threadId: thread.id,
                    post,
                    scoreResult,
                    draftResult,
                    evaluation,
                    deliveryMode: capabilities.delivery,
                    hasAnthropic,
                    redditCommunityPolicyDecision,
                });
            }
            if (thread && enqueueFollowUpJobs) {
                await (0, follow_up_outbox_1.persistAndDispatchFollowUps)({
                    userId,
                    threadId: thread.id,
                    rank: post.url ? { url: post.url } : undefined,
                    slack: {
                        postUrl: post.url,
                        postTitle: post.title || post.text?.slice(0, 100),
                        postAuthor: post.author,
                        intentScore: scoreResult.score,
                        draftText,
                        subreddit: post.sourceTarget || 'reddit',
                    },
                });
            }
            logger_1.logger.info({ userId, reason: evaluation.reason, confidence: evaluation.automationConfidence, threshold: evaluation.dynamicThreshold }, 'Routed to manual review');
        }
    }
    catch (error) {
        if (signalReserved) {
            await safelyReleaseMonthlySignal(userId);
        }
        if (draftReserved) {
            if (draftSpendReservationId) {
                await safelyReleaseMonthlyDraft(userId, draftSpendReservationId);
            }
            else {
                logger_1.logger.error({ userId }, 'Draft allowance was reserved without a spend reservation id');
            }
        }
        logger_1.logger.error({ err: error }, `Failed to score post ${post.externalId} for user ${userId}:`);
        throw error;
    }
}
function blockAutomation(evaluation, reason) {
    return { ...evaluation, approved: false, reason };
}
async function recordInitialAutomationAudit(input) {
    const { userId, threadId, post, scoreResult, draftResult, evaluation, deliveryMode, hasAnthropic, redditCommunityPolicyDecision, } = input;
    const source = 'scheduled_monitor';
    await Promise.all([
        (0, automation_audit_1.recordEngagementEvent)(supabase_1.supabaseWorker, {
            userId,
            threadId,
            eventType: 'signal_discovered',
            platform: post.platform,
            source,
            metadata: {
                externalId: post.externalId,
                sourceTarget: post.sourceTarget,
                sourceCreatedAt: post.createdAt,
            },
            idempotencyKey: `${threadId}:signal-discovered`,
            occurredAt: post.createdAt,
        }),
        (0, automation_audit_1.recordEngagementEvent)(supabase_1.supabaseWorker, {
            userId,
            threadId,
            eventType: 'intent_scored',
            platform: post.platform,
            metadata: {
                score: scoreResult.score,
                label: scoreResult.label,
                reasoning: scoreResult.reasoning,
                provider: hasAnthropic ? 'anthropic' : 'deterministic',
            },
            idempotencyKey: `${threadId}:intent-scored`,
        }),
        (0, automation_audit_1.recordEngagementEvent)(supabase_1.supabaseWorker, {
            userId,
            threadId,
            eventType: 'draft_generated',
            platform: post.platform,
            metadata: {
                provider: 'anthropic',
                model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
                qualityIssues: draftResult.qualityIssues.map(issue => issue.code),
                mentionedProduct: draftResult.mentionedProduct,
                hasDisclosure: draftResult.hasDisclosure,
            },
            idempotencyKey: `${threadId}:initial-draft-generated`,
        }),
        (0, automation_audit_1.recordEngagementEvent)(supabase_1.supabaseWorker, {
            userId,
            threadId,
            eventType: 'automation_evaluated',
            platform: post.platform,
            metadata: {
                approved: evaluation.approved,
                reason: evaluation.reason,
                confidence: evaluation.automationConfidence,
                threshold: evaluation.dynamicThreshold,
                deliveryMode,
                communityPolicy: (0, reddit_community_policy_1.toCommunityPolicyAudit)(redditCommunityPolicyDecision),
            },
            idempotencyKey: `${threadId}:initial-automation-evaluated`,
        }),
        (0, automation_audit_1.recordAutomationDecision)(supabase_1.supabaseWorker, {
            userId,
            threadId,
            platform: post.platform,
            deliveryMode,
            evaluation,
            idempotencyKey: `${threadId}:initial-automation-decision`,
            contentPolicy: {
                flagged: draftResult.flagged,
                qualityIssues: draftResult.qualityIssues.map(issue => issue.code),
                mentionedProduct: draftResult.mentionedProduct,
                hasDisclosure: draftResult.hasDisclosure,
                hasCommercialLink: draftResult.hasCommercialLink,
                ...((0, reddit_community_policy_1.toCommunityPolicyAudit)(redditCommunityPolicyDecision)
                    ? { communityPolicy: (0, reddit_community_policy_1.toCommunityPolicyAudit)(redditCommunityPolicyDecision) }
                    : {}),
            },
            modelContext: {
                intentProvider: hasAnthropic ? 'anthropic' : 'deterministic',
                intentModel: process.env.ANTHROPIC_INTENT_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
                draftProvider: 'anthropic',
                draftModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
                policyVersion: 'earned-automation-v1',
            },
        }),
    ]);
}
async function reserveMonthlySignal(userId, limit) {
    const { data, error } = await supabase_1.supabaseWorker.rpc('reserve_monthly_signal', {
        p_user_id: userId,
        p_limit: limit,
    });
    if (error) {
        throw new Error(`Signal budget reservation failed: ${error.message}`);
    }
    return data === true;
}
async function safelyReleaseMonthlySignal(userId) {
    const { error } = await supabase_1.supabaseWorker.rpc('release_monthly_signal', {
        p_user_id: userId,
    });
    if (error) {
        logger_1.logger.error({ error, userId }, 'Failed to release monthly signal reservation');
    }
}
async function safelyReleaseMonthlyDraft(userId, reservationId) {
    try {
        await (0, ai_settlement_1.releaseMonthlyDraftDurably)(supabase_1.supabaseWorker, { userId, reservationId });
    }
    catch (error) {
        logger_1.logger.error({ error, userId, reservationId }, 'Failed to release monthly draft reservation');
    }
}
async function safelyRecordAiUsage(reservationId, usage, context) {
    try {
        await (0, ai_settlement_1.settleAiUsageDurably)(supabase_1.supabaseWorker, {
            reservationId,
            userId: context.userId,
            usage,
        });
    }
    catch (error) {
        logger_1.logger.error({ error, reservationId, ...context }, 'Failed to reconcile AI usage reservation');
    }
}
async function safelyReleaseAiSpend(reservationId, context) {
    try {
        await (0, ai_settlement_1.releaseAiSpendDurably)(supabase_1.supabaseWorker, {
            reservationId,
            userId: context.userId,
        });
    }
    catch (error) {
        logger_1.logger.error({ error, reservationId, ...context }, 'Failed to release AI spend reservation');
    }
}
async function settleFailedAiSpend(reservationId, error, context) {
    const usage = (0, ai_usage_1.getAiUsageFromError)(error);
    if (usage.inputTokens > 0
        || usage.outputTokens > 0
        || usage.estimatedCostMicrousd > 0) {
        await safelyRecordAiUsage(reservationId, usage, context);
        return;
    }
    await safelyReleaseAiSpend(reservationId, context);
}
async function checkBudget(userId, plan, service) {
    if (service === 'draft') {
        const { data, error } = await supabase_1.supabaseWorker.rpc('reserve_monthly_draft', {
            p_user_id: userId,
            p_limit: (0, plan_limits_1.getPlanLimits)((0, plan_limits_1.normalizePlan)(plan)).aiDraftsPerMonth,
        });
        if (error) {
            throw new Error(`Draft budget reservation failed: ${error.message}`);
        }
        return data;
    }
    const limit = (0, plan_limits_1.getIntentDailyLimit)(plan);
    const { data, error } = await supabase_1.supabaseWorker.rpc('increment_usage_if_under_limit', {
        p_user_id: userId,
        p_service: 'intent',
        p_limit: limit,
    });
    if (error) {
        throw new Error(`Budget reservation failed: ${error.message}`);
    }
    return data;
}
async function saveThread(input) {
    const { userId, keywordId, post, intentScore, intentLabel, status, draftText, flag, reasoning, trackingSid, evidenceSignals, qualityIssues, automationReason, autoSendPayload, } = input;
    const { data: threadId, error } = await supabase_1.supabaseWorker.rpc('persist_scored_thread_v2', {
        p_user_id: userId,
        p_keyword_id: keywordId,
        p_platform: post.platform,
        p_external_id: post.externalId,
        p_author: post.author,
        p_title: post.title || null,
        p_text_content: post.text,
        p_url: post.url,
        p_source_created_at: post.createdAt,
        p_intent_score: intentScore,
        p_intent_label: intentLabel,
        p_status: status,
        p_flag: flag || null,
        p_reasoning: reasoning || null,
        p_tracking_sid: trackingSid || null,
        p_matched_signals: evidenceSignals,
        p_quality_issues: qualityIssues ?? [],
        p_automation_reason: automationReason || null,
        p_draft_text: draftText || null,
        p_auto_send_payload: autoSendPayload ?? null,
    });
    if (error) {
        throw new Error(`Failed to persist monitored thread: ${error.message}`);
    }
    if (!threadId)
        throw new Error('Failed to persist monitored thread: missing id');
    return { id: threadId };
}
/** Keep unanalysed plan-limited captures out of every customer-facing queue. */
async function clearUnscoredIntent(threadId) {
    const { error } = await supabase_1.supabaseWorker
        .from('monitored_threads')
        .update({ intent_score: null, intent_label: null })
        .eq('id', threadId)
        .eq('status', 'dismissed');
    if (error) {
        throw new Error(`Failed to clear unscored intent state: ${error.message}`);
    }
}
