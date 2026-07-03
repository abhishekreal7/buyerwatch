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
const intent_scorer_1 = require("../../src/lib/intent-scorer");
const draft_reply_1 = require("../../src/lib/draft-reply");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase_1 = require("../lib/supabase");
const INTENT_THRESHOLD = 60;
async function scorePostHandler(job) {
    const { userId, keywordId, post } = job.data;
    try {
        // 1. Check if we already processed this exact post for this user
        const { data: existing } = await supabase_1.supabaseWorker
            .from('monitored_threads')
            .select('id')
            .eq('user_id', userId)
            .eq('platform', post.platform)
            .eq('external_id', post.externalId)
            .maybeSingle();
        if (existing)
            return;
        // 2. Fetch user profile for context and plan
        const { data: profile } = await supabase_1.supabaseWorker
            .from('profiles')
            .select('business_name, business_description, business_url, business_type, writing_style, plan')
            .eq('id', userId)
            .single();
        if (!profile)
            return;
        // 3. Atomic Budget Check for Scoring (Gemini)
        const canScore = await checkBudget(userId, profile.plan, 'gemini');
        if (!canScore) {
            console.log(`[Budget] User ${userId} exceeded gemini limit.`);
            return; // Silent skip
        }
        // 4. Score intent
        const scoreResult = await (0, intent_scorer_1.scoreIntent)(post, profile);
        // Save thread early if score is low
        if (scoreResult.score < INTENT_THRESHOLD) {
            await saveThread(userId, keywordId, post, scoreResult.score, 'dismissed');
            return;
        }
        // 5. Atomic Budget Check for Drafting (Claude)
        const canDraft = await checkBudget(userId, profile.plan, 'claude');
        if (!canDraft) {
            console.log(`[Budget] User ${userId} exceeded claude limit.`);
            // Save as needs manual reply
            await saveThread(userId, keywordId, post, scoreResult.score, 'needs_manual_reply');
            return;
        }
        // 6. Draft Reply
        const draftText = await (0, draft_reply_1.draftReply)(post, profile, scoreResult.score);
        await saveThread(userId, keywordId, post, scoreResult.score, 'drafted', draftText);
    }
    catch (error) {
        console.error(`Failed to score post ${post.externalId} for user ${userId}:`, error);
        throw error;
    }
}
async function checkBudget(userId, plan, service) {
    const limits = {
        free: { gemini: 50, claude: 5 },
        pro: { gemini: 500, claude: 100 },
        business: { gemini: 2000, claude: 500 },
    };
    const userPlan = limits[plan] ? plan : 'free';
    const limit = limits[userPlan][service];
    const { data, error } = await supabase_1.supabaseWorker.rpc('increment_usage_if_under_limit', {
        p_user_id: userId,
        p_service: service,
        p_limit: limit,
    });
    if (error) {
        console.error('Error checking budget:', error);
        return false; // Fail safe: don't spend if RPC fails
    }
    return data;
}
async function saveThread(userId, keywordId, post, intentScore, status, draftText) {
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
        status: status
    })
        .select()
        .single();
    if (error) {
        console.error('Error inserting monitored_thread:', error);
        return;
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
            console.error('Error inserting reply_analytics:', analyticsError);
        }
    }
}
