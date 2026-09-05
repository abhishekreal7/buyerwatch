"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordEngagementEvent = recordEngagementEvent;
exports.recordAutomationDecision = recordAutomationDecision;
async function recordEngagementEvent(supabase, input) {
    const { error } = await supabase.from('engagement_events').upsert({
        user_id: input.userId,
        thread_id: input.threadId ?? null,
        event_type: input.eventType,
        platform: input.platform ?? null,
        actor_type: input.actorType ?? 'system',
        source: input.source ?? 'buyerwatch',
        metadata: input.metadata ?? {},
        idempotency_key: input.idempotencyKey,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
    }, {
        onConflict: 'user_id,idempotency_key',
        ignoreDuplicates: true,
    });
    if (error && !isMissingAuditSchema(error)) {
        throw new Error(`Unable to record engagement event: ${error.message}`);
    }
}
async function recordAutomationDecision(supabase, input) {
    const decision = input.evaluation.approved
        ? 'approved'
        : input.deliveryMode === 'assisted'
            ? 'assisted'
            : 'manual_review';
    const { error } = await supabase.from('automation_decisions').upsert({
        user_id: input.userId,
        thread_id: input.threadId,
        platform: input.platform,
        decision,
        reason: input.evaluation.reason,
        delivery_mode: input.deliveryMode,
        automation_confidence: input.evaluation.automationConfidence,
        dynamic_threshold: input.evaluation.dynamicThreshold,
        configured_threshold: input.evaluation.configuredThreshold,
        user_trust: input.evaluation.userTrust,
        community_trust: input.evaluation.communityTrust,
        total_drafts_reviewed: input.evaluation.totalDraftsReviewed,
        content_policy: input.contentPolicy ?? {},
        model_context: input.modelContext ?? {},
        idempotency_key: input.idempotencyKey,
    }, {
        onConflict: 'user_id,idempotency_key',
        ignoreDuplicates: true,
    });
    if (error && !isMissingAuditSchema(error)) {
        throw new Error(`Unable to record automation decision: ${error.message}`);
    }
}
function isMissingAuditSchema(error) {
    return error.code === '42P01'
        || error.code === 'PGRST205'
        || Boolean(error.message?.includes('schema cache'));
}
