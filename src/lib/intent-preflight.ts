import { analyzeBuyingSignals } from './buying-signal-filter'
import type { IntentLabel, IntentResult } from './intent'
import { containsConfiguredPhrase } from './phrase-match'
import type { NormalizedPost } from './types'

export type IntentPreflightProfile = {
  business_name?: string | null
  business_description?: string | null
  competitors?: string[] | null
}

export type IntentPreflightResult = IntentResult & {
  shouldUseAi: boolean
  isQualifiedCandidate: boolean
  evidenceSignals: string[]
  matchedKeywords: string[]
  relevanceTerms: string[]
  noiseSignals: string[]
}

const DEFAULT_AI_PREFLIGHT_THRESHOLD = 55

const GENERIC_RELEVANCE_TERMS = new Set([
  'about',
  'after',
  'also',
  'app',
  'apps',
  'based',
  'best',
  'build',
  'business',
  'company',
  'conversation',
  'conversations',
  'customer',
  'customers',
  'data',
  'find',
  'founder',
  'from',
  'generation',
  'good',
  'help',
  'high',
  'intent',
  'into',
  'lead',
  'leads',
  'like',
  'marketing',
  'more',
  'need',
  'online',
  'people',
  'platform',
  'product',
  'reddit',
  'saas',
  'sales',
  'service',
  'social',
  'software',
  'startup',
  'that',
  'this',
  'tool',
  'tools',
  'user',
  'users',
  'using',
  'with',
])

const NOISE_PATTERNS: Array<{ label: string; pattern: RegExp; penalty: number }> = [
  {
    label: 'self_promotion',
    pattern: /\b(?:i|we)(?:'ve| have)?\s+(?:(?:just|finally|recently)\s+)?(?:built|made|launched|created|released|shipped|finished|developed|introduced)\b|\b(?:just|finally|recently)\s+(?:finished|launched|shipped)\b/i,
    penalty: 38,
  },
  {
    label: 'showcase',
    pattern: /\b(show\s+hn|roast\s+my|feedback\s+on\s+my|check\s+out\s+my|introducing|give\s+me\s+(?:your\s+)?thoughts|looking\s+for\s+(?:your\s+)?feedback|not\s+looking\s+for\s+(?:sign[-\s]?ups?|customers?|sales))\b/i,
    penalty: 34,
  },
  {
    label: 'hiring_or_job_search',
    pattern: /\b(hiring|job\s+opening|looking\s+for\s+(a\s+)?job|resume|cv|recruiter|recruiters)\b/i,
    penalty: 35,
  },
  {
    label: 'content_promo',
    pattern: /\b(newsletter|webinar|course|ebook|blog\s+post|youtube\s+video)\b/i,
    penalty: 22,
  },
  {
    label: 'fundraising_or_update',
    pattern: /\b(fundraising|raised\s+\$|monthly\s+update|weekly\s+update|progress\s+update)\b/i,
    penalty: 18,
  },
]

const DISQUALIFYING_NOISE_SIGNALS = new Set([
  'self_promotion',
  'showcase',
])

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLocaleLowerCase()
}

function termsFrom(value: string | null | undefined): string[] {
  return [...new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/g)
      .map(term => term.trim())
      .filter(term => term.length >= 4 && !GENERIC_RELEVANCE_TERMS.has(term)),
  )]
}

export function getIntentNoiseSignals(text: string): string[] {
  return NOISE_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label)
}

/**
 * These are author-side activities, not requests to buy. Reject them before
 * saving a lead so generic phrases such as "looking for feedback" cannot turn
 * into false buyer-intent candidates.
 */
export function hasDisqualifyingIntentNoise(text: string): boolean {
  return getIntentNoiseSignals(text).some(signal =>
    DISQUALIFYING_NOISE_SIGNALS.has(signal),
  )
}

function labelForScore(score: number): IntentLabel {
  if (score >= 80) return 'buying'
  if (score >= 60) return 'researching'
  if (score >= 40) return 'complaining'
  return 'other'
}

function scoreFromCategories(categories: string[]): number {
  const scores = categories.map((category) => {
    if (category === 'purchase') return 82
    if (category === 'seeking') return 72
    if (category === 'research') return 64
    if (category === 'pain') return 54
    return 35
  })
  if (scores.length === 0) return 30
  return Math.max(...scores) + Math.max(0, scores.length - 1) * 4
}

function configuredThreshold(): number {
  const parsed = Number(process.env.INTENT_AI_PREFLIGHT_THRESHOLD)
  if (!Number.isFinite(parsed)) return DEFAULT_AI_PREFLIGHT_THRESHOLD
  return Math.min(80, Math.max(35, Math.round(parsed)))
}

export function evaluateIntentPreflight(
  post: NormalizedPost,
  profile: IntentPreflightProfile,
  options: { keywordTerm?: string | null } = {},
): IntentPreflightResult {
  const text = `${post.title ?? ''} ${post.text ?? ''}`.trim()
  const analysis = analyzeBuyingSignals(text)
  const keywordTerm = options.keywordTerm?.trim() || ''
  const matchedKeywords = containsConfiguredPhrase(text, keywordTerm)
    ? [keywordTerm]
    : []
  const relevanceTerms = [
    ...termsFrom(profile.business_name),
    ...termsFrom(profile.business_description),
  ].filter(term => containsConfiguredPhrase(text, term))
  const uniqueRelevanceTerms = [...new Set(relevanceTerms)]
  const noiseSignals = getIntentNoiseSignals(text)
  const competitorRisk = (profile.competitors ?? []).some((competitor) =>
    competitor.trim().length > 1 && containsConfiguredPhrase(text, competitor),
  )
  const noisePenalty = NOISE_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .reduce((total, { penalty }) => total + penalty, 0)
  const categoryScore = scoreFromCategories(analysis.categories)
  const keywordBoost = matchedKeywords.length > 0 ? 8 : 0
  const relevanceBoost = Math.min(10, uniqueRelevanceTerms.length * 3)
  const competitorBoost = competitorRisk ? 14 : 0
  const questionBoost = /[?]|\b(how|what|which|where|anyone|does|is there)\b/i.test(text) ? 4 : 0
  const shortPenalty = text.length < 36 ? 14 : 0
  const hasContextualMatch = matchedKeywords.length > 0 || uniqueRelevanceTerms.length > 0 || competitorRisk
  const hasDisqualifyingNoise = noiseSignals.some(signal =>
    DISQUALIFYING_NOISE_SIGNALS.has(signal),
  )
  const missingContextPenalty = hasContextualMatch ? 0 : 42
  const disqualifyingNoisePenalty = hasDisqualifyingNoise ? 22 : 0
  const score = Math.max(
    0,
    Math.min(
      95,
      Math.round(
        categoryScore
        + keywordBoost
        + relevanceBoost
        + competitorBoost
        + questionBoost
        - noisePenalty
        - disqualifyingNoisePenalty
        - missingContextPenalty
        - shortPenalty,
      ),
    ),
  )
  const hasDirectCommercialShape = analysis.categories.some(category =>
    category === 'purchase' || category === 'seeking' || category === 'research',
  )
  const isQualifiedCandidate = (
    hasContextualMatch
    && analysis.categories.length > 0
    && !hasDisqualifyingNoise
  )
  const shouldUseAi = (
    score >= configuredThreshold()
    && isQualifiedCandidate
    && hasDirectCommercialShape
  ) || (
    competitorRisk
    && isQualifiedCandidate
    && score >= 50
  )
  const evidenceSignals = [
    ...analysis.matchedSignals,
    ...matchedKeywords.map(term => `keyword:${term}`),
    ...uniqueRelevanceTerms.map(term => `context:${term}`),
    ...noiseSignals.map(signal => `noise:${signal}`),
  ]
  const label = labelForScore(score)
  const reasoning = !isQualifiedCandidate
    ? `Preflight rejected this candidate: ${evidenceSignals.slice(0, 4).join(', ') || 'no verified buyer context'}.`
    : shouldUseAi
      ? `Preflight passed: ${evidenceSignals.slice(0, 4).join(', ') || 'commercial context matched'}.`
      : evidenceSignals.length > 0
        ? `Preflight kept this deterministic: ${evidenceSignals.slice(0, 4).join(', ')}.`
        : 'Preflight found no strong commercial intent signals.'

  return {
    score,
    label,
    reasoning,
    ...(competitorRisk ? { flag: 'COMPETITOR_RISK' as const } : {}),
    shouldUseAi,
    isQualifiedCandidate,
    evidenceSignals,
    matchedKeywords,
    relevanceTerms: uniqueRelevanceTerms,
    noiseSignals,
  }
}
