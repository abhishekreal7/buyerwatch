export const INTENT_LABELS = ['buying', 'researching', 'complaining', 'other'] as const
export const LOW_RELEVANCE_THRESHOLD = 40
export const ACTIONABLE_INTENT_THRESHOLD = 60
export const DISMISSED_NOISE_FLOOR = 25

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
  const rawScore = Number(candidate.score)
  if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 100) {
    throw new Error('Intent provider returned an invalid response')
  }

  const roundedScore = Math.max(0, Math.min(100, Math.round(rawScore)))
  const expectedLabel: IntentLabel = roundedScore >= 80
    ? 'buying'
    : roundedScore >= 60
      ? 'researching'
      : roundedScore >= 40
        ? 'complaining'
        : 'other'

  const rawReasoning = typeof candidate.reasoning === 'string' ? candidate.reasoning.trim() : ''
  const reasoning = rawReasoning.length >= 8
    ? rawReasoning.slice(0, 500)
    : 'Intent analysis completed based on post context.'

  const flag = candidate.flag === 'COMPETITOR_RISK' ? 'COMPETITOR_RISK' : undefined

  return {
    score: roundedScore,
    label: expectedLabel,
    reasoning,
    ...(flag ? { flag } : {}),
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

export function isLowRelevanceScore(score: number | null | undefined): boolean {
  return typeof score === 'number'
    && Number.isFinite(score)
    && score < LOW_RELEVANCE_THRESHOLD
}
