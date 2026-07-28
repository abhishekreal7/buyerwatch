export type ReplyQualityIssueCode =
  | 'empty'
  | 'too_long'
  | 'formulaic_opening'
  | 'assistant_meta'
  | 'promotional_language'
  | 'call_to_action'
  | 'unsupported_claim'
  | 'missing_disclosure'

export type ReplyQualityIssue = {
  code: ReplyQualityIssueCode
  message: string
}

export const PROMOTIONAL_PHRASES = [
  /\bcheck (?:it|this|us|our product) out\b/i,
  /\byou should try\b/i,
  /\bhighly recommend\b/i,
  /\bgame[ -]?changer\b/i,
  /\brevolutionary\b/i,
  /\bbest[- ]in[- ]class\b/i,
  /\b(?:the )?#?1\b/i,
  /\bguaranteed\b/i,
  /\btransform your\b/i,
  /\bunlock (?:your|the)\b/i,
  /!{2,}/,
] as const

export const CALL_TO_ACTION_PHRASES = [
  /\b(?:sign|book|start|join) (?:up|a demo|a trial|today|now)\b/i,
  /\bclick (?:here|the link)\b/i,
  /\bvisit (?:our|my|the) (?:site|website)\b/i,
  /\bdm me\b/i,
  /\blet me know if you want\b/i,
  /\bhappy to (?:share|show|walk you through)\b/i,
] as const

export const UNSUPPORTED_CLAIM_PHRASES = [
  /\bwe (?:increased|grew|reduced|saved|doubled|tripled) .{0,40}\b(?:by|in) \d/i,
  /\b\d+(?:\.\d+)?x (?:faster|better|more)\b/i,
  /\b\d+% (?:increase|decrease|improvement|better|faster)\b/i,
] as const

export const FORMULAIC_OPENING_PHRASES = [
  /^(?:great|good|interesting) (?:question|point)[!,.]/i,
  /^(?:i )?(?:totally|completely) agree\b/i,
  /^thanks for (?:asking|posting|sharing)\b/i,
  /^it sounds like\b/i,
  /^absolutely[!,.]/i,
] as const

export const ASSISTANT_META_PHRASES = [
  /^here(?:'s| is) (?:a |the )?(?:suggested )?(?:reply|response|draft)\b/i,
  /^(?:suggested )?(?:reply|response|draft)\s*:/i,
  /\bas an ai\b/i,
] as const

export const DISCLOSURE_PATTERNS = [
  /\bdisclos\w*\b/i,
  /\bi'?m (?:affiliated|associated) with\b/i,
  /\bi (?:work|worked) (?:at|for|on)\b/i,
  /\bi'?m (?:the )?(?:founder|cofounder|co-founder)\b/i,
  /\bi (?:built|made|created) (?:this|it|the product)\b/i,
  /\bmy (?:own )?product\b/i,
] as const

const URL_PATTERN = /\bhttps?:\/\/[^\s<>()]+/i

const PLATFORM_LENGTH_LIMITS: Record<string, number> = {
  bluesky: 300,
  x: 280,
  threads: 500,
  reddit: 2_000,
}

export function cleanDraftOutput(text: string): string {
  let cleaned = text.trim()

  const fenced = cleaned.match(/^```(?:text|markdown)?\s*\n?([\s\S]*?)\n?```$/i)
  if (fenced) cleaned = fenced[1].trim()

  cleaned = cleaned
    .replace(/^(?:suggested )?(?:reply|response|draft)\s*:\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const quotePairs: ReadonlyArray<readonly [string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
  ]
  const wrappingQuotes = quotePairs.find(
    ([open, close]) => cleaned.startsWith(open) && cleaned.endsWith(close),
  )
  if (wrappingQuotes && cleaned.length > 1) {
    cleaned = cleaned.slice(wrappingQuotes[0].length, -wrappingQuotes[1].length).trim()
  }

  return cleaned
}

export function hasDisclosure(text: string): boolean {
  return DISCLOSURE_PATTERNS.some(pattern => pattern.test(text))
}

export function mentionsProduct(text: string, businessName: string): boolean {
  const normalizedName = businessName.trim().toLocaleLowerCase()
  return normalizedName.length >= 2 && text.toLocaleLowerCase().includes(normalizedName)
}

export function hasCommercialLink(text: string): boolean {
  return URL_PATTERN.test(text)
}

export function evaluateReplyQuality(
  text: string,
  context: { businessName: string; platform: string },
): {
  issues: ReplyQualityIssue[]
  blocksAutomation: boolean
  hasDisclosure: boolean
  mentionedProduct: boolean
  hasCommercialLink: boolean
} {
  const trimmed = text.trim()
  const issues: ReplyQualityIssue[] = []
  const mentionedProduct = mentionsProduct(trimmed, context.businessName)
  const commercialLink = hasCommercialLink(trimmed)
  const disclosure = hasDisclosure(trimmed)
  const lengthLimit = PLATFORM_LENGTH_LIMITS[context.platform] ?? 1_000

  if (!trimmed) {
    issues.push({ code: 'empty', message: 'The reply is empty.' })
  }
  if (trimmed.length > lengthLimit) {
    issues.push({
      code: 'too_long',
      message: `The reply exceeds the ${lengthLimit}-character limit for ${context.platform}.`,
    })
  }
  if (FORMULAIC_OPENING_PHRASES.some(pattern => pattern.test(trimmed))) {
    issues.push({
      code: 'formulaic_opening',
      message: 'The reply starts with generic agreement or acknowledgement instead of useful substance.',
    })
  }
  if (ASSISTANT_META_PHRASES.some(pattern => pattern.test(trimmed))) {
    issues.push({
      code: 'assistant_meta',
      message: 'The reply contains assistant-facing framing instead of publishable text.',
    })
  }
  if (PROMOTIONAL_PHRASES.some(pattern => pattern.test(trimmed))) {
    issues.push({
      code: 'promotional_language',
      message: 'The reply contains promotional or exaggerated language.',
    })
  }
  if (CALL_TO_ACTION_PHRASES.some(pattern => pattern.test(trimmed))) {
    issues.push({
      code: 'call_to_action',
      message: 'The reply contains a direct call to action.',
    })
  }
  if (UNSUPPORTED_CLAIM_PHRASES.some(pattern => pattern.test(trimmed))) {
    issues.push({
      code: 'unsupported_claim',
      message: 'The reply contains a numerical outcome that is not grounded in supplied context.',
    })
  }
  if ((mentionedProduct || commercialLink) && !disclosure) {
    issues.push({
      code: 'missing_disclosure',
      message: 'A product mention or commercial link requires a clear affiliation disclosure.',
    })
  }

  return {
    issues,
    blocksAutomation: issues.length > 0,
    hasDisclosure: disclosure,
    mentionedProduct,
    hasCommercialLink: commercialLink,
  }
}

export function formatReplyRevisionInstruction(issues: ReplyQualityIssue[]): string {
  const reasons = issues.map(issue => issue.message).join(' ')
  return [
    'Rewrite the draft so it is safe to publish as a genuinely useful community response.',
    reasons,
    'Do not invent personal experience, customer results, numbers, or product capabilities.',
    'Mention the product only when it directly helps answer the post.',
    'If the product or its link is mentioned, disclose the affiliation naturally.',
    'Return only the revised reply.',
  ].join(' ')
}
