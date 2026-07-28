"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeThreshold = computeThreshold;
exports.evaluateAutoSendContentPolicy = evaluateAutoSendContentPolicy;
exports.calculateAutomationDecision = calculateAutomationDecision;
exports.evaluateAutoSend = evaluateAutoSend;
const supabase_js_1 = require("@supabase/supabase-js");
const MIN_FEEDBACK_FOR_TRUST = 10;
const MIN_COMMUNITY_SAMPLE = 10;
function computeThreshold(avgEditDistance) {
    return 85 - ((avgEditDistance - 0.5) * 10);
}
function evaluateAutoSendContentPolicy(draftResult, profile) {
    if (profile.plan === 'free') {
        return {
            approved: false,
            reason: 'auto_send_requires_paid_plan',
            dynamicThreshold: 100,
            automationConfidence: 0,
        };
    }
    if (!profile.auto_send_enabled) {
        return {
            approved: false,
            reason: 'auto_send_disabled',
            dynamicThreshold: 100,
            automationConfidence: 0,
        };
    }
    if (draftResult.flagged) {
        return {
            approved: false,
            reason: 'reply_quality_blocked',
            dynamicThreshold: 100,
            automationConfidence: 0,
        };
    }
    const hasCommercialReference = Boolean(draftResult.mentionedProduct || draftResult.hasCommercialLink);
    if (hasCommercialReference && !draftResult.hasDisclosure) {
        return {
            approved: false,
            reason: 'missing_disclosure',
            dynamicThreshold: 100,
            automationConfidence: 0,
        };
    }
    return null;
}
function calculateAutomationDecision(input) {
    const configuredThreshold = Math.min(100, Math.max(70, input.configuredThreshold ?? 85));
    const dynamicThreshold = Math.max(configuredThreshold, input.learnedThreshold);
    const automationConfidence = (0.70 * input.userTrust) + (0.30 * input.communityTrust);
    const approved = automationConfidence >= dynamicThreshold;
    return {
        approved,
        reason: approved ? 'confidence_cleared' : 'below_dynamic_threshold',
        dynamicThreshold,
        automationConfidence,
    };
}
function getSupabase() {
    return (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}
async function getUserTrustMetrics(userId) {
    const { data, error } = await getSupabase()
        .from('user_trust_metrics')
        .select('total_drafts_reviewed, avg_edit_distance')
        .eq('user_id', userId)
        .single();
    if (!error)
        return data;
    if (error.code === 'PGRST116')
        return null;
    if (error.code === '42P01' || error.message?.includes('schema cache'))
        return null;
    throw new Error(`[confidence-engine] getUserTrustMetrics failed: ${error.code} - ${error.message}`);
}
async function getCommunityMetrics(platform, targetCommunity) {
    let query = getSupabase()
        .from('community_trust_metrics')
        .select('total_engagements, rejection_rate')
        .eq('platform', platform);
    if (targetCommunity)
        query = query.eq('target_community', targetCommunity);
    const { data, error } = await query.maybeSingle();
    if (!error)
        return data;
    if (error.code === '42P01' || error.message?.includes('schema cache'))
        return null;
    throw new Error(`[confidence-engine] getCommunityMetrics failed: ${error.code} - ${error.message}`);
}
async function evaluateAutoSend(userId, platform, draftResult, profile, targetCommunity) {
    const contentDecision = evaluateAutoSendContentPolicy(draftResult, profile);
    if (contentDecision)
        return contentDecision;
    const userMetrics = await getUserTrustMetrics(userId);
    const totalReviewed = userMetrics?.total_drafts_reviewed ?? 0;
    let learnedThreshold;
    let userTrust;
    if (totalReviewed < MIN_FEEDBACK_FOR_TRUST) {
        const communityMetrics = await getCommunityMetrics(platform, targetCommunity);
        const hasSufficientCommunityData = communityMetrics && communityMetrics.total_engagements >= MIN_COMMUNITY_SAMPLE;
        if (!hasSufficientCommunityData) {
            return {
                approved: false,
                reason: 'cold_start_insufficient_data',
                dynamicThreshold: 100,
                automationConfidence: 0,
            };
        }
        const communityTrustProxy = 1 - Number(communityMetrics.rejection_rate);
        learnedThreshold = computeThreshold(communityTrustProxy);
        userTrust = communityTrustProxy * 100;
    }
    else {
        const avgEditDistance = Number(userMetrics.avg_edit_distance);
        learnedThreshold = computeThreshold(avgEditDistance);
        userTrust = avgEditDistance * 100;
    }
    const communityMetrics = await getCommunityMetrics(platform, targetCommunity);
    const communityTrust = communityMetrics
        ? (1 - Number(communityMetrics.rejection_rate)) * 100
        : 80;
    return calculateAutomationDecision({
        userTrust,
        communityTrust,
        learnedThreshold,
        configuredThreshold: profile.auto_send_threshold,
    });
}
