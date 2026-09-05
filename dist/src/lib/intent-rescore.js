"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTENT_RESCORE_ACTIVE_STATUSES = void 0;
exports.planIntentRescore = planIntentRescore;
const intent_1 = require("./intent");
exports.INTENT_RESCORE_ACTIVE_STATUSES = [
    'pending',
    'drafted',
    'needs_manual_reply',
];
function equalStrings(left, right) {
    const normalizedLeft = left ?? [];
    return normalizedLeft.length === right.length
        && normalizedLeft.every((value, index) => value === right[index]);
}
/**
 * Convert a fresh deterministic preflight into a safe historical-row update.
 *
 * A maintenance pass may demote an active row, but it never resurrects a
 * dismissed/replied row or changes an in-flight send. The database RPC applies
 * the same active-status guard transactionally.
 */
function planIntentRescore(row, preflight) {
    const shouldDismiss = !preflight.isQualifiedCandidate
        || preflight.score < intent_1.ACTIONABLE_INTENT_THRESHOLD;
    const nextStatus = shouldDismiss ? 'dismissed' : row.status;
    const flag = preflight.flag ?? null;
    const automationReason = shouldDismiss
        ? 'intent_rescore_rejected_v1'
        : 'intent_rescore_refreshed_v1';
    const shouldApply = (row.intent_score !== preflight.score
        || row.intent_label !== preflight.label
        || row.flag !== flag
        || row.score_reasoning !== preflight.reasoning
        || !equalStrings(row.matched_signals, preflight.evidenceSignals)
        || row.automation_reason !== automationReason
        || row.status !== nextStatus);
    return {
        shouldApply,
        shouldDismiss,
        nextStatus,
        score: preflight.score,
        label: preflight.label,
        flag,
        reasoning: preflight.reasoning,
        matchedSignals: preflight.evidenceSignals,
        automationReason,
    };
}
