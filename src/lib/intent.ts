export const INTENT_LABELS = ['buying', 'researching', 'complaining', 'other'] as const

export type IntentLabel = (typeof INTENT_LABELS)[number]

export type IntentResult = {
  score: number
  label: IntentLabel
  reasoning: string
  flag?: 'COMPETITOR_RISK'
}

export function parseIntentResult(value: unknown): IntentResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Intent provider returned a non-object response')
  }

  const candidate = value as Record<string, unknown>
  const score = candidate.score
  const label = candidate.label
  const reasoning = candidate.reasoning
  const flag = candidate.flag

  if (
    typeof score !== 'number'
    || !Number.isFinite(score)
    || score < 0
    || score > 100
    || typeof label !== 'string'
    || !INTENT_LABELS.includes(label as IntentLabel)
    || typeof reasoning !== 'string'
    || reasoning.trim().length < 8
    || reasoning.trim().length > 500
    || (flag !== undefined && flag !== null && flag !== 'COMPETITOR_RISK')
  ) {
    throw new Error('Intent provider returned an invalid response')
  }

  const roundedScore = Math.round(score)
  const expectedLabel: IntentLabel = roundedScore >= 80
    ? 'buying'
    : roundedScore >= 60
      ? 'researching'
      : roundedScore >= 40
        ? 'complaining'
        : 'other'
  if (label !== expectedLabel) {
    throw new Error('Intent provider returned an inconsistent score and label')
  }

  return {
    score: roundedScore,
    label: label as IntentLabel,
    reasoning: reasoning.trim(),
    ...(flag === 'COMPETITOR_RISK' ? { flag } : {}),
  }
}

export function getIntentDisplayLabel(label: IntentLabel | null | undefined, score: number): string {
  if (label === 'buying') return 'Buying intent'
  if (label === 'researching') return 'Researching'
  if (label === 'complaining') return 'Pain signal'
  if (label === 'other') return 'Low relevance'
  if (score >= 80) return 'Buying intent'
  if (score >= 60) return 'Researching'
  return 'Low relevance'
}
