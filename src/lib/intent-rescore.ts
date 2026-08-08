import { ACTIONABLE_INTENT_THRESHOLD, type IntentLabel } from './intent'
import type { IntentPreflightResult } from './intent-preflight'

export const INTENT_RESCORE_ACTIVE_STATUSES = [
  'pending',
  'drafted',
  'needs_manual_reply',
] as const

export type IntentRescoreActiveStatus = (typeof INTENT_RESCORE_ACTIVE_STATUSES)[number]

export type IntentRescoreRow = {
  status: IntentRescoreActiveStatus
  intent_score: number | null
  intent_label: IntentLabel | null
  flag: string | null
  score_reasoning: string | null
  matched_signals: string[] | null
  automation_reason: string | null
}

export type IntentRescorePlan = {
  shouldApply: boolean
  shouldDismiss: boolean
  nextStatus: IntentRescoreActiveStatus | 'dismissed'
  score: number
  label: IntentLabel
  flag: 'COMPETITOR_RISK' | null
  reasoning: string
  matchedSignals: string[]
  automationReason: 'intent_rescore_rejected_v1' | 'intent_rescore_refreshed_v1'
}

function equalStrings(left: string[] | null, right: string[]): boolean {
  const normalizedLeft = left ?? []
  return normalizedLeft.length === right.length
    && normalizedLeft.every((value, index) => value === right[index])
}

/**
 * Convert a fresh deterministic preflight into a safe historical-row update.
 *
 * A maintenance pass may demote an active row, but it never resurrects a
 * dismissed/replied row or changes an in-flight send. The database RPC applies
 * the same active-status guard transactionally.
 */
export function planIntentRescore(
  row: IntentRescoreRow,
  preflight: IntentPreflightResult,
): IntentRescorePlan {
  const shouldDismiss = !preflight.isQualifiedCandidate
    || preflight.score < ACTIONABLE_INTENT_THRESHOLD
  const nextStatus = shouldDismiss ? 'dismissed' : row.status
  const flag = preflight.flag ?? null
  const automationReason = shouldDismiss
    ? 'intent_rescore_rejected_v1'
    : 'intent_rescore_refreshed_v1'
  const shouldApply = (
    row.intent_score !== preflight.score
    || row.intent_label !== preflight.label
    || row.flag !== flag
    || row.score_reasoning !== preflight.reasoning
    || !equalStrings(row.matched_signals, preflight.evidenceSignals)
    || row.automation_reason !== automationReason
    || row.status !== nextStatus
  )

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
  }
}
