import { analyzeBuyingSignals } from './buying-signal-filter'
import type { IntentLabel, IntentResult } from './intent'
import type { NormalizedPost } from './types'

export type IntentPreflightProfile = {
  business_name?: string | null
  business_description?: string | null
  competitors?: string[] | null
}

export type IntentPreflightResult = IntentResult & {
  shouldUseAi: boolean
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
  'customer',
  'customers',
  'data',
  'find',
  'founder',
  'from',
  'good',
  'help',
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
  { label: 'self_promotion', pattern: /\b(i|we)\s+(built|made|launched|created|released|shipped)\b/i, penalty: 32 },
  { label: 'showcase', pattern: /\b(show\s+hn|roast\s+my|feedback\s+on\s+my|check\s+out\s+my|introducing)\b/i, penalty: 28 },
  { label: 'hiring_or_job_search', pattern: /\b(hiring|job\s+opening|looking\s+for\s+(a\s+)?job|resume|cv|recruiter|recruiters)\b/i, penalty: 35 },
  { label: 'content_promo', pattern: /\b(newsletter|webinar|course|ebook|blog\s+post|youtube\s+video)\b/i, penalty: 22 },
  { label: 'fundraising_or_update', pattern: /\b(fundraising|raised\s+\$|monthly\s+update|weekly\s+update|progress\s+update)\b/i, penalty: 18 },
]

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLocaleLowerCase()
}

function includesPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = phrase.trim().toLocaleLowerCase()
  return normalizedPhrase.length > 0 && text.includes(normalizedPhrase)
}

function termsFrom(value: string | null | undefined): string[] {
  return [...new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/g)
      .map(term => term.trim())
      .filter(term => term.length >= 4 && !GENERIC_RELEVANCE_TERMS.has(term)),
  )]
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
  const normalizedText = normalizeText(text)
  const analysis = analyzeBuyingSignals(text)
  const keywordTerm = options.keywordTerm?.trim() || ''
  const matchedKeywords = includesPhrase(normalizedText, keywordTerm)
    ? [keywordTerm]
    : []
  const relevanceTerms = [
    ...termsFrom(profile.business_name),
    ...termsFrom(profile.business_description),
    ...termsFrom(keywordTerm),
  ].filter(term => normalizedText.includes(term))
  const uniqueRelevanceTerms = [...new Set(relevanceTerms)]
  const noiseSignals = NOISE_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label)
  const competitorRisk = (profile.competitors ?? []).some((competitor) => {
    const normalized = competitor.trim().toLocaleLowerCase()
    return normalized.length > 1 && normalizedText.includes(normalized)
  })
  const noisePenalty = NOISE_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .reduce((total, { penalty }) => total + penalty, 0)
  const categoryScore = scoreFromCategories(analysis.categories)
  const keywordBoost = matchedKeywords.length > 0 ? 8 : 0
  const relevanceBoost = Math.min(10, uniqueRelevanceTerms.length * 3)
  const competitorBoost = competitorRisk ? 14 : 0
  const questionBoost = /[?]|\b(how|what|which|where|anyone|does|is there)\b/i.test(text) ? 4 : 0
  const shortPenalty = text.length < 36 ? 14 : 0
  const score = Math.max(
    0,
    Math.min(
      95,
      Math.round(categoryScore + keywordBoost + relevanceBoost + competitorBoost + questionBoost - noisePenalty - shortPenalty),
    ),
  )
  const hasDirectCommercialShape = analysis.categories.some(category =>
    category === 'purchase' || category === 'seeking' || category === 'research',
  )
  const hasContextualMatch = matchedKeywords.length > 0 || uniqueRelevanceTerms.length > 0 || competitorRisk
  const shouldUseAi = (
    score >= configuredThreshold()
    && hasDirectCommercialShape
    && hasContextualMatch
    && !(noiseSignals.length > 0 && score < 70)
  ) || (
    competitorRisk
    && analysis.categories.length > 0
    && score >= 50
  )
  const evidenceSignals = [
    ...analysis.matchedSignals,
    ...matchedKeywords.map(term => `keyword:${term}`),
    ...uniqueRelevanceTerms.map(term => `context:${term}`),
    ...noiseSignals.map(signal => `noise:${signal}`),
  ]
  const label = labelForScore(score)
  const reasoning = shouldUseAi
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
    evidenceSignals,
    matchedKeywords,
    relevanceTerms: uniqueRelevanceTerms,
    noiseSignals,
  }
}
