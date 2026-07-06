"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAutoSend = evaluateAutoSend;
const supabase_js_1 = require("@supabase/supabase-js");
/**
 * Automation Confidence Engine — single gatekeeper for all auto-send decisions.
 *
 * This is the ONLY place in the codebase where the decision to auto-send a draft
 * is computed. Both the background worker (score-post.ts) and the API route
 * (api/replies/send/route.ts) must call evaluateAutoSend() and nowhere else
 * must dynamicThreshold or automationConfidence be independently calculated.
 *
 * Gate ordering (fail-fast):
 *   Gate 0: auto_send_enabled feature flag
 *   Gate 1: hard content safeguards (disclosure presence, promotional tone)
 *   Gate 2: cold-start floor (< MIN_FEEDBACK_FOR_TRUST reviews → force manual)
 *   Gate 3: confidence threshold comparison
 */
/** Minimum number of reviewed drafts before a user's personal trust history is used. */
const MIN_FEEDBACK_FOR_TRUST = 10;
/** Minimum number of community engagements before community metrics are trusted. */
const MIN_COMMUNITY_SAMPLE = 10;
/**
 * Base threshold. The engine adjusts this up or down based on avg_edit_distance.
 *
 * Formula (validated in schema.sql, replicated exactly here):
 *   dynamic_threshold = 85.0 - ((avg_edit_distance - 0.5) * 10.0)
 *
 * At avg_edit_distance = 1.0 (user never edits) → threshold = 80  (easier to auto-send)
 * At avg_edit_distance = 0.5 (baseline)          → threshold = 85  (unchanged)
 * At avg_edit_distance = 0.0 (user always rewrites) → threshold = 90 (harder to auto-send)
 */
function computeThreshold(avgEditDistance) {
    return 85.0 - ((avgEditDistance - 0.5) * 10.0);
}
/**
 * Creates a Supabase service-role client. Works in both the Next.js API
 * context and the standalone BullMQ worker process (both load .env.local).
 */
function getSupabase() {
    return (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}
async function getUserTrustMetrics(userId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('user_trust_metrics')
        .select('total_drafts_reviewed, avg_edit_distance, dynamic_threshold')
        .eq('user_id', userId)
        .single();
    if (!error)
        return data;
    // PGRST116 = no rows found (safe: user simply has no history yet)
    if (error.code === 'PGRST116')
        return null;
    // 42P01 = relation does not exist (schema not yet migrated — safe, treat as no history)
    if (error.code === '42P01' || error.message?.includes('schema cache'))
        return null;
    // Anything else (connection failure, permissions, timeout) is a real infrastructure error.
    // Do NOT silently swallow it — surface it so the send path fails closed rather than
    // masking a real problem behind a reassuring-looking cold-start default.
    throw new Error(`[confidence-engine] getUserTrustMetrics failed: ${error.code} — ${error.message}`);
}
async function getCommunityMetrics(platform, targetCommunity) {
    const supabase = getSupabase();
    let query = supabase
        .from('community_trust_metrics')
        .select('total_engagements, rejection_rate')
        .eq('platform', platform);
    if (targetCommunity) {
        query = query.eq('target_community', targetCommunity);
    }
    const { data, error } = await query.maybeSingle();
    if (!error)
        return data;
    // 42P01 = relation does not exist (schema not yet migrated — safe, no community data)
    if (error.code === '42P01' || error.message?.includes('schema cache'))
        return null;
    // Real infrastructure errors must not be silently swallowed.
    throw new Error(`[confidence-engine] getCommunityMetrics failed: ${error.code} — ${error.message}`);
}
/**
 * The single gatekeeper function. Call this before adding any job to sendReplyQueue.
 *
 * @param userId         - Supabase auth user ID
 * @param platform       - 'reddit' | 'bluesky' | etc.
 * @param draftResult    - Output from draftReply(), must carry flagged and hasDisclosure
 * @param profile        - User profile row, must carry auto_send_enabled
 * @param targetCommunity - Optional subreddit/community for community metrics lookup
 */
async function evaluateAutoSend(userId, platform, draftResult, profile, targetCommunity) {
    // Gate 0: feature flag — hard stop if the user has disabled automation entirely
    if (!profile.auto_send_enabled) {
        return {
            approved: false,
            reason: 'auto_send_disabled',
            dynamicThreshold: 100,
            automationConfidence: 0,
        };
    }
    // Gate 1: content safeguards — these are non-negotiable and run BEFORE any math.
    // A highly-trusted user must still pass these; trust doesn't override content policy.
    if (draftResult.flagged) {
        return {
            approved: false,
            reason: 'promotional_tone_flagged',
            dynamicThreshold: 100,
            automationConfidence: 0,
        };
    }
    if (!draftResult.hasDisclosure) {
        return {
            approved: false,
            reason: 'missing_disclosure',
            dynamicThreshold: 100,
            automationConfidence: 0,
        };
    }
    // Gate 2: cold-start floor
    const userMetrics = await getUserTrustMetrics(userId);
    const totalReviewed = userMetrics?.total_drafts_reviewed ?? 0;
    let dynamicThreshold;
    let uTrust;
    if (totalReviewed < MIN_FEEDBACK_FOR_TRUST) {
        // Not enough personal history — attempt fallback to community signal
        const communityMetrics = await getCommunityMetrics(platform, targetCommunity);
        const communityHasSufficientData = communityMetrics && communityMetrics.total_engagements >= MIN_COMMUNITY_SAMPLE;
        if (communityHasSufficientData) {
            // Use community avg as a proxy. Community rejection_rate → implicit edit distance proxy.
            // A community with low rejection = community trusts this type of reply.
            const communityTrustProxy = 1.0 - communityMetrics.rejection_rate;
            dynamicThreshold = computeThreshold(communityTrustProxy);
            uTrust = communityTrustProxy * 100;
        }
        else {
            // No personal history AND no sufficient community data → force manual review, no exceptions
            return {
                approved: false,
                reason: 'cold_start_insufficient_data',
                dynamicThreshold: 100,
                automationConfidence: 0,
            };
        }
    }
    else {
        // Enough personal history — use the user's own computed threshold from DB
        // (already maintained by the log_draft_feedback RPC), then compute confidence.
        const avgEditDistance = userMetrics.avg_edit_distance;
        dynamicThreshold = computeThreshold(avgEditDistance);
        uTrust = avgEditDistance * 100;
    }
    // Fetch community signal to blend into final confidence score (30% weight)
    const communityMetrics = await getCommunityMetrics(platform, targetCommunity);
    const cTrust = communityMetrics
        ? (1.0 - Number(communityMetrics.rejection_rate)) * 100
        : 80; // Safe default: assume 80% community trust if no data
    // Gate 3: weighted confidence comparison (70% user trust, 30% community trust)
    const automationConfidence = (0.70 * uTrust) + (0.30 * cTrust);
    const approved = automationConfidence >= dynamicThreshold;
    return {
        approved,
        reason: approved ? 'confidence_cleared' : 'below_dynamic_threshold',
        dynamicThreshold,
        automationConfidence,
    };
}
