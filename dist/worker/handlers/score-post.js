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
const logger_1 = require("../../src/lib/logger");
const intent_scorer_1 = require("../../src/lib/intent-scorer");
const draft_reply_1 = require("../../src/lib/draft-reply");
const confidence_engine_1 = require("../../src/lib/confidence-engine");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const attribution_1 = require("../../src/lib/attribution");
const buying_signal_filter_1 = require("../../src/lib/buying-signal-filter");
const app_url_1 = require("../../src/lib/app-url");
const plan_limits_1 = require("../../src/lib/plan-limits");
const ai_usage_1 = require("../../src/lib/ai-usage");
const backend_maintenance_1 = require("../../src/lib/backend-maintenance");
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase_1 = require("../lib/supabase");
const INTENT_THRESHOLD = 60;
async function scorePostHandler(job) {
    const { userId, keywordId, post } = job.data;
    let signalReserved = false;
    let draftReserved = false;
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
            await (0, backend_maintenance_1.dispatchPendingOutbox)(1, existing.id);
            return;
        }
        // 2. Fetch user profile for context and plan
        const { data: extendedProfile } = await supabase_1.supabaseWorker
            .from('profiles')
            .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, competitors, tone_examples, plan, auto_send_enabled, auto_send_threshold, referral_tracking_enabled')
            .eq('id', userId)
            .single();
        let profile = extendedProfile;
        if (!profile) {
            const legacyResult = await supabase_1.supabaseWorker
                .from('profiles')
                .select('business_name, business_description, business_url, business_type, writing_style, competitors, tone_examples, plan, auto_send_enabled, auto_send_threshold, referral_tracking_enabled')
                .eq('id', userId)
                .single();
            if (legacyResult.error)
                throw legacyResult.error;
            profile = legacyResult.data
                ? { ...legacyResult.data, tone_archetype: null, style_guardrails: [] }
                : null;
        }
        if (!profile)
            throw new Error('Profile not found for scoring job');
        const plan = (0, plan_limits_1.normalizePlan)(profile.plan);
        const planLimits = (0, plan_limits_1.getPlanLimits)(plan);
        let scoreResult;
        let evidenceSignals;
        if (existing) {
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
            // 3. Reserve one monthly signal slot before paid AI work.
            const canProcessSignal = await reserveMonthlySignal(userId, planLimits.threadsPerMonth);
            if (!canProcessSignal) {
                logger_1.logger.info({ userId, plan }, 'Monthly signal limit reached');
                return;
            }
            signalReserved = true;
            // 4. Reserve provider spend and the daily intent allowance atomically.
            const intentSpend = await (0, ai_usage_1.reserveAiSpend)(supabase_1.supabaseWorker, {
                userId,
                purpose: 'intent',
                plan,
            });
            if (!intentSpend) {
                logger_1.logger.warn({ userId, plan }, 'AI spend cap blocked intent scoring');
                await safelyReleaseMonthlySignal(userId);
                signalReserved = false;
                return;
            }
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
                logger_1.logger.info({ userId }, 'Daily intent-scoring limit reached');
                await safelyReleaseMonthlySignal(userId);
                signalReserved = false;
                return;
            }
            // 5. Score intent and reconcile the reservation with actual usage.
            try {
                scoreResult = await (0, intent_scorer_1.scoreIntent)(post, profile);
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
                throw error;
            }
            evidenceSignals = (0, buying_signal_filter_1.matchedSignals)(`${post.title ?? ''} ${post.text ?? ''}`);
        }
        // Save thread early if score is low
        if (scoreResult.score < INTENT_THRESHOLD) {
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
        // Persist the paid intent result before drafting. A retry resumes from this
        // checkpoint and never pays to classify the same user/post twice.
        if (!existing) {
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
            draftResult = await (0, draft_reply_1.draftReply)(post, profile, scoreResult.score, trackingUrl);
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
            await safelyReleaseMonthlyDraft(userId);
            draftReserved = false;
            throw error;
        }
        const draftText = draftResult.text;
        // 7. Auto-send decision — routed through the single unified gatekeeper.
        //    All safeguards (disclosure, tone, cold-start, confidence threshold)
        //    are enforced inside evaluateAutoSend(). DO NOT inline duplicate logic here.
        const evaluation = await (0, confidence_engine_1.evaluateAutoSend)(userId, post.platform, draftResult, {
            auto_send_enabled: profile.auto_send_enabled,
            auto_send_threshold: profile.auto_send_threshold,
            plan: profile.plan ?? 'free',
        }, post.sourceTarget ?? null);
        if (evaluation.approved && ['reddit', 'bluesky'].includes(post.platform)) {
            // All gates cleared — save and enqueue for auto-send
            const autoSendPayload = {
                userId,
                threadExternalId: post.externalId,
                text: draftText,
                platform: post.platform,
                triggerType: 'auto',
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
                const { notifySlackQueue, checkGoogleRankQueue } = await import('../../src/lib/queues/index.js');
                await (0, backend_maintenance_1.dispatchPendingOutbox)(1, thread.id);
                // Fire-and-forget: check if thread URL ranks on Google for this keyword (Feature 5)
                if (post.url) {
                    checkGoogleRankQueue.add(`rank-${thread.id}`, { threadId: thread.id, url: post.url, matchedKeyword: post.sourceTarget }).catch(() => { });
                }
                // Fire-and-forget Slack notification
                notifySlackQueue.add(`slack-${thread.id}`, {
                    userId,
                    postUrl: post.url,
                    postTitle: post.title || post.text?.slice(0, 100),
                    postAuthor: post.author,
                    intentScore: scoreResult.score,
                    draftText,
                    subreddit: post.sourceTarget || 'reddit',
                }).catch(() => { }); // never block on Slack
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
                const { notifySlackQueue, checkGoogleRankQueue } = await import('../../src/lib/queues/index.js');
                // Fire-and-forget: check if thread URL ranks on Google (Feature 5)
                if (post.url) {
                    checkGoogleRankQueue.add(`rank-${thread.id}`, { threadId: thread.id, url: post.url }).catch(() => { });
                }
                // Fire-and-forget Slack notification
                notifySlackQueue.add(`slack-${thread.id}`, {
                    userId,
                    postUrl: post.url,
                    postTitle: post.title || post.text?.slice(0, 100),
                    postAuthor: post.author,
                    intentScore: scoreResult.score,
                    draftText,
                    subreddit: post.sourceTarget || 'reddit',
                }).catch(() => { }); // never block on Slack
            }
            logger_1.logger.info({ userId, reason: evaluation.reason, confidence: evaluation.automationConfidence, threshold: evaluation.dynamicThreshold }, 'Routed to manual review');
        }
    }
    catch (error) {
        if (signalReserved) {
            await safelyReleaseMonthlySignal(userId);
        }
        if (draftReserved) {
            await safelyReleaseMonthlyDraft(userId);
        }
        logger_1.logger.error({ error }, `Failed to score post ${post.externalId} for user ${userId}:`);
        throw error;
    }
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
async function safelyReleaseMonthlyDraft(userId) {
    const { error } = await supabase_1.supabaseWorker.rpc('release_monthly_draft', {
        p_user_id: userId,
    });
    if (error) {
        logger_1.logger.error({ error, userId }, 'Failed to release monthly draft reservation');
    }
}
async function safelyRecordAiUsage(reservationId, usage, context) {
    try {
        await (0, ai_usage_1.recordAiUsage)(supabase_1.supabaseWorker, { reservationId, usage });
    }
    catch (error) {
        logger_1.logger.error({ error, reservationId, ...context }, 'Failed to reconcile AI usage reservation');
    }
}
async function safelyReleaseAiSpend(reservationId, context) {
    try {
        await (0, ai_usage_1.releaseAiSpend)(supabase_1.supabaseWorker, reservationId);
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
    const limits = {
        free: 50,
        pro: 500,
        growth: 2000,
    };
    const userPlan = limits[plan] ? plan : 'free';
    const limit = limits[userPlan];
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
    const { data: threadId, error } = await supabase_1.supabaseWorker.rpc('persist_scored_thread', {
        p_user_id: userId,
        p_keyword_id: keywordId,
        p_platform: post.platform,
        p_external_id: post.externalId,
        p_author: post.author,
        p_title: post.title || null,
        p_text_content: post.text,
        p_url: post.url,
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
