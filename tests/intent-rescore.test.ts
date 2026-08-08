import { describe, expect, it } from 'vitest'
import {
  planIntentRescore,
  type IntentRescoreRow,
} from '../src/lib/intent-rescore'
import type { IntentPreflightResult } from '../src/lib/intent-preflight'

const row: IntentRescoreRow = {
  status: 'drafted',
  intent_score: 92,
  intent_label: 'buying',
  flag: null,
  score_reasoning: 'Legacy provider score.',
  matched_signals: ['legacy'],
  automation_reason: 'draft_ready',
}

function preflight(
  overrides: Partial<IntentPreflightResult>,
): IntentPreflightResult {
  return {
    score: 0,
    label: 'other',
    reasoning: 'Preflight rejected this historical candidate.',
    shouldUseAi: false,
    isQualifiedCandidate: false,
    evidenceSignals: ['noise:self_promotion'],
    matchedKeywords: [],
    relevanceTerms: [],
    noiseSignals: ['self_promotion'],
    ...overrides,
  }
}

describe('historical intent rescore planning', () => {
  it('dismisses a formerly high-scored promotional row', () => {
    const plan = planIntentRescore(row, preflight({}))

    expect(plan.shouldApply).toBe(true)
    expect(plan.shouldDismiss).toBe(true)
    expect(plan.nextStatus).toBe('dismissed')
    expect(plan.automationReason).toBe('intent_rescore_rejected_v1')
  })

  it('retains an active row when the deterministic score remains actionable', () => {
    const result = preflight({
      score: 88,
      label: 'buying',
      reasoning: 'Preflight passed with buyer context and budget.',
      isQualifiedCandidate: true,
      shouldUseAi: true,
      evidenceSignals: ['need software', 'budget', 'keyword:lead generation'],
      noiseSignals: [],
    })
    const plan = planIntentRescore(row, result)

    expect(plan.shouldDismiss).toBe(false)
    expect(plan.nextStatus).toBe('drafted')
    expect(plan.score).toBe(88)
    expect(plan.automationReason).toBe('intent_rescore_refreshed_v1')
  })

  it('dismisses a qualified but non-actionable pain signal below 60', () => {
    const plan = planIntentRescore(row, preflight({
      score: 57,
      label: 'complaining',
      isQualifiedCandidate: true,
      evidenceSignals: ['manual workflow', 'keyword:lead generation'],
      noiseSignals: [],
    }))

    expect(plan.shouldDismiss).toBe(true)
    expect(plan.score).toBe(57)
    expect(plan.label).toBe('complaining')
  })

  it('is idempotent after the planned values have been persisted', () => {
    const result = preflight({
      score: 72,
      label: 'researching',
      reasoning: 'Preflight kept this deterministic: need software.',
      isQualifiedCandidate: true,
      evidenceSignals: ['need software'],
      noiseSignals: [],
    })
    const first = planIntentRescore({ ...row, status: 'needs_manual_reply' }, result)
    const persisted: IntentRescoreRow = {
      status: 'needs_manual_reply',
      intent_score: first.score,
      intent_label: first.label,
      flag: first.flag,
      score_reasoning: first.reasoning,
      matched_signals: first.matchedSignals,
      automation_reason: first.automationReason,
    }

    expect(planIntentRescore(persisted, result).shouldApply).toBe(false)
  })
})
