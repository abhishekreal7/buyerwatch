export type SuggestionSource = 'ai' | 'website' | 'fallback'

export type OnboardingSuggestions = {
  businessName?: string
  description: string
  subreddits: string[]
  buyerKeywords: string[]
  competitorKeywords: string[]
  painPointKeywords: string[]
  source: SuggestionSource
}

type SuggestionCandidate = Partial<Omit<OnboardingSuggestions, 'source'>>

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function cleanList(
  value: unknown,
  options: { maxItems: number; maxLength: number; pattern?: RegExp },
): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const cleaned = cleanText(item, options.maxLength).replace(/^r\//i, '')
    const key = cleaned.toLocaleLowerCase()
    if (
      cleaned.length < 2
      || seen.has(key)
      || (options.pattern && !options.pattern.test(cleaned))
    ) {
      continue
    }
    seen.add(key)
    result.push(cleaned)
    if (result.length >= options.maxItems) break
  }
  return result
}

export function sanitizeOnboardingSuggestions(
  candidate: SuggestionCandidate,
  source: SuggestionSource,
): OnboardingSuggestions {
  return {
    businessName: cleanText(candidate.businessName, 120) || undefined,
    description: cleanText(candidate.description, 1_000),
    subreddits: cleanList(candidate.subreddits, {
      maxItems: 8,
      maxLength: 50,
      pattern: /^[A-Za-z0-9_]+$/,
    }),
    buyerKeywords: cleanList(candidate.buyerKeywords, { maxItems: 8, maxLength: 120 }),
    competitorKeywords: cleanList(candidate.competitorKeywords, { maxItems: 8, maxLength: 120 }),
    painPointKeywords: cleanList(candidate.painPointKeywords, { maxItems: 8, maxLength: 120 }),
    source,
  }
}

export function buildFallbackSuggestions(input: {
  businessName: string
  description: string
  webpageTitle: string
  webpageDescription: string
}): OnboardingSuggestions {
  const context = `${input.description} ${input.webpageTitle} ${input.webpageDescription}`.toLocaleLowerCase()
  const subreddits = context.match(/\b(?:developer|api|code|software|saas)\b/)
    ? ['SaaS', 'startups', 'webdev', 'programming', 'Entrepreneur']
    : context.match(/\b(?:shop|store|ecommerce|retail|product)\b/)
      ? ['ecommerce', 'smallbusiness', 'Entrepreneur', 'marketing', 'startups']
      : ['SaaS', 'startups', 'Entrepreneur', 'smallbusiness', 'marketing']

  return sanitizeOnboardingSuggestions({
    businessName: input.businessName,
    description: input.description || input.webpageDescription || input.webpageTitle,
    subreddits,
    buyerKeywords: [
      'looking for a tool',
      'recommend a tool',
      'best way to',
    ],
    competitorKeywords: [
      'alternative to',
      'switching from',
      'too expensive',
    ],
    painPointKeywords: [
      'struggling with',
      'need a better way',
      'does not work',
    ],
  }, input.webpageDescription || input.webpageTitle ? 'website' : 'fallback')
}
