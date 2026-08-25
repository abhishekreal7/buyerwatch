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

export type WebsiteProfile = {
  title: string
  description: string
  content: string
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (entity, code: string) => {
      const point = Number(code)
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity
    })
    .replace(/&#x([0-9a-f]+);/gi, (entity, code: string) => {
      const point = Number.parseInt(code, 16)
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) => HTML_ENTITY_MAP[name.toLocaleLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim()
}

function readMetaContent(html: string, key: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const attributes = new Map<string, string>()
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
      attributes.set(match[1].toLocaleLowerCase(), match[2])
    }
    const metaKey = (attributes.get('name') ?? attributes.get('property') ?? '').toLocaleLowerCase()
    if (metaKey === key.toLocaleLowerCase()) return decodeHtml(attributes.get('content') ?? '')
  }
  return ''
}

export function extractWebsiteProfile(html: string): WebsiteProfile {
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  const headings = [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map(match => decodeHtml(match[1].replace(/<[^>]+>/g, ' ')))
    .filter(Boolean)
    .slice(0, 12)
  const visibleText = html
    .replace(/<(?:script|style|noscript|svg)\b[\s\S]*?<\/(?:script|style|noscript|svg)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

  return {
    title: readMetaContent(html, 'og:title') || decodeHtml(titleTag),
    description: readMetaContent(html, 'description') || readMetaContent(html, 'og:description'),
    content: decodeHtml(`${headings.join(' ')} ${visibleText}`).slice(0, 4_000),
  }
}

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
  webpageContent?: string
}): OnboardingSuggestions {
  const context = `${input.description} ${input.webpageTitle} ${input.webpageDescription} ${input.webpageContent ?? ''}`
    .toLocaleLowerCase()
  const profiles = [
    {
      pattern: /\b(?:growth partner|digital marketing|creative agency|marketing agency|consulting|business intelligence|client services)\b/,
      subreddits: ['marketing', 'smallbusiness', 'Entrepreneur', 'ecommerce', 'startups'],
      solution: 'digital marketing agency',
      action: 'grow my business online',
    },
    {
      pattern: /\b(?:lead generation|sales|outreach|marketing|buyer intent|social listening|crm)\b/,
      subreddits: ['marketing', 'sales', 'SaaS', 'Entrepreneur', 'startups'],
      solution: 'lead generation tool',
      action: 'find qualified leads',
    },
    {
      pattern: /\b(?:shop|store|e-?commerce|retail|shopify|woocommerce)\b/,
      subreddits: ['ecommerce', 'shopify', 'smallbusiness', 'Entrepreneur', 'marketing'],
      solution: 'ecommerce tool',
      action: 'grow an online store',
    },
    {
      pattern: /\b(?:real estate|realtor|property|mortgage|broker)\b/,
      subreddits: ['realestate', 'realtors', 'RealEstateInvesting', 'smallbusiness', 'marketing'],
      solution: 'real estate software',
      action: 'generate real estate leads',
    },
    {
      pattern: /\b(?:developer|api|code|software|saas|automation|platform)\b/,
      subreddits: ['SaaS', 'startups', 'webdev', 'programming', 'Entrepreneur'],
      solution: 'software tool',
      action: 'automate this workflow',
    },
    {
      pattern: /\b(?:creator|newsletter|podcast|video|youtube|content)\b/,
      subreddits: ['ContentCreators', 'NewTubers', 'podcasting', 'marketing', 'Entrepreneur'],
      solution: 'creator tool',
      action: 'grow an audience',
    },
  ]
  const profile = profiles.find(candidate => candidate.pattern.test(context)) ?? {
    subreddits: ['smallbusiness', 'Entrepreneur', 'startups', 'marketing', 'SaaS'],
    solution: 'business tool',
    action: 'improve this workflow',
  }
  const hasWebsiteContext = Boolean(input.webpageTitle || input.webpageDescription || input.webpageContent)

  return sanitizeOnboardingSuggestions({
    businessName: input.businessName,
    description: input.description
      || input.webpageDescription
      || input.webpageContent?.slice(0, 400)
      || input.webpageTitle,
    subreddits: profile.subreddits,
    buyerKeywords: [
      'looking for a tool',
      `recommend a ${profile.solution}`,
      `best ${profile.solution}`,
    ],
    competitorKeywords: [
      `alternatives to a ${profile.solution}`,
      `switching from a ${profile.solution}`,
      `${profile.solution} too expensive`,
    ],
    painPointKeywords: [
      `struggling to ${profile.action}`,
      `how to ${profile.action}`,
      `need a better way to ${profile.action}`,
    ],
  }, hasWebsiteContext ? 'website' : 'fallback')
}
