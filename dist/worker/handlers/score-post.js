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
const reply_jobs_1 = require("../../src/lib/reply-jobs");
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase_1 = require("../lib/supabase");
const INTENT_THRESHOLD = 60;
async function scorePostHandler(job) {
    const { userId, keywordId, post } = job.data;
    try {
        // 1. Check if we already processed this exact post for this user
        const { data: existing, error: existingError } = await supabase_1.supabaseWorker
            .from('monitored_threads')
            .select('id')
            .eq('user_id', userId)
            .eq('platform', post.platform)
            .eq('external_id', post.externalId)
            .maybeSingle();
        if (existingError)
            throw existingError;
        if (existing)
            return;
        // 2. Fetch user profile for context and plan
        const { data: profile, error: profileError } = await supabase_1.supabaseWorker
            .from('profiles')
            .select('business_name, business_description, business_url, business_type, writing_style, plan, auto_send_enabled, auto_send_threshold, referral_tracking_enabled')
            .eq('id', userId)
            .single();
        if (profileError)
            throw profileError;
        if (!profile)
            throw new Error('Profile not found for scoring job');
        // 3. Atomic Budget Check for Scoring (Gemini)
        const canScore = await checkBudget(userId, profile.plan, 'gemini');
        if (!canScore) {
            logger_1.logger.info(`[Budget] User ${userId} exceeded gemini limit.`);
            return; // Silent skip
        }
        // 4. Score intent
        const scoreResult = await (0, intent_scorer_1.scoreIntent)(post, profile);
        // Save thread early if score is low
        if (scoreResult.score < INTENT_THRESHOLD) {
            await saveThread(userId, keywordId, post, scoreResult.score, 'dismissed', undefined, scoreResult.flag, scoreResult.reasoning);
            return;
        }
        // 5. Atomic Budget Check for Drafting (Claude)
        const canDraft = await checkBudget(userId, profile.plan, 'claude');
        if (!canDraft) {
            logger_1.logger.info(`[Budget] User ${userId} exceeded claude limit.`);
            // Save as needs manual reply
            await saveThread(userId, keywordId, post, scoreResult.score, 'needs_manual_reply', undefined, scoreResult.flag);
            return;
        }
        // 6. Draft Reply — generate tracking SID before drafting so Claude can embed it naturally
        const trackingEnabled = profile.referral_tracking_enabled !== false; // default true
        const trackingSid = trackingEnabled ? (0, crypto_1.randomBytes)(5).toString('base64url') : undefined; // ~7-char URL-safe token
        const trackingUrl = trackingEnabled && profile.business_url && trackingSid
            ? `${profile.business_url.replace(/\/$/, '')}?ref=scouto&sid=${trackingSid}`
            : undefined;
        const draftResult = await (0, draft_reply_1.draftReply)(post, profile, scoreResult.score, trackingUrl);
        const draftText = draftResult.text;
        // 7. Auto-send decision — routed through the single unified gatekeeper.
        //    All safeguards (disclosure, tone, cold-start, confidence threshold)
        //    are enforced inside evaluateAutoSend(). DO NOT inline duplicate logic here.
        const evaluation = await (0, confidence_engine_1.evaluateAutoSend)(userId, post.platform, draftResult, { auto_send_enabled: profile.auto_send_enabled, plan: profile.plan ?? 'free' }, post.sourceTarget ?? null);
        if (evaluation.approved) {
            // All gates cleared — save and enqueue for auto-send
            const thread = await saveThread(userId, keywordId, post, scoreResult.score, 'drafted', draftText, scoreResult.flag, scoreResult.reasoning, trackingSid);
            if (thread) {
                const { sendReplyQueue, notifySlackQueue, checkGoogleRankQueue } = await import('../../src/lib/queues/index.js');
                await sendReplyQueue.add('send', {
                    userId,
                    threadExternalId: post.externalId,
                    threadId: thread.id,
                    text: draftText,
                    platform: post.platform,
                    triggerType: 'auto',
                }, {
                    jobId: (0, reply_jobs_1.getSendReplyJobId)(thread.id),
                });
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
            const thread = await saveThread(userId, keywordId, post, scoreResult.score, 'drafted', draftText, scoreResult.flag, scoreResult.reasoning, trackingSid);
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
        logger_1.logger.error({ error }, `Failed to score post ${post.externalId} for user ${userId}:`);
        throw error;
    }
}
async function checkBudget(userId, plan, service) {
    const limits = {
        free: { gemini: 50, claude: 40 }, // 40 aligns with plan-limits.ts free.aiDraftsPerMonth
        pro: { gemini: 500, claude: 400 },
        growth: { gemini: 2000, claude: 2000 },
    };
    const userPlan = limits[plan] ? plan : 'free';
    const limit = limits[userPlan][service];
    const { data, error } = await supabase_1.supabaseWorker.rpc('increment_usage_if_under_limit', {
        p_user_id: userId,
        p_service: service,
        p_limit: limit,
    });
    if (error) {
        throw new Error(`Budget reservation failed: ${error.message}`);
    }
    return data;
}
async function saveThread(userId, keywordId, post, intentScore, status, draftText, flag, reasoning, trackingSid) {
    const { data: thread, error } = await supabase_1.supabaseWorker
        .from('monitored_threads')
        .insert({
        user_id: userId,
        keyword_id: keywordId,
        platform: post.platform,
        external_id: post.externalId,
        author: post.author,
        text_content: post.text,
        url: post.url,
        intent_score: intentScore,
        status: status,
        flag: flag || null,
        score_reasoning: reasoning || null,
        tracking_sid: trackingSid || null,
    })
        .select()
        .single();
    if (error) {
        throw new Error(`Failed to persist monitored thread: ${error.message}`);
    }
    if (draftText && thread) {
        const { error: analyticsError } = await supabase_1.supabaseWorker
            .from('reply_analytics')
            .insert({
            user_id: userId,
            thread_id: thread.id,
            draft_text: draftText,
        });
        if (analyticsError) {
            throw new Error(`Failed to persist reply analytics: ${analyticsError.message}`);
        }
    }
    return thread;
}
