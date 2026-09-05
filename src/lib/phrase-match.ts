/**
 * Match a configured phrase as whole normalized words. This prevents a short
 * keyword such as "lead" from matching unrelated words, while treating
 * punctuation and whitespace as equivalent separators.
 */
function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const CONTROLLED_PHRASE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'lead generation': [
    'generate leads',
    'generating leads',
    'find leads',
    'finding leads',
    'customer acquisition',
    'get customers',
    'getting customers',
  ],
  'cold email': ['cold emailing', 'cold outreach', 'outbound email', 'email outreach'],
  marketing: ['marketing strategy', 'go to market', 'customer acquisition'],
  sales: ['sales process', 'selling', 'close deals', 'closing deals'],
}

export function containsConfiguredPhrase(
  text: string | null | undefined,
  phrase: string | null | undefined,
): boolean {
  const normalizedText = normalize(text)
  const normalizedPhrase = normalize(phrase)
  if (!normalizedText || !normalizedPhrase) return false

  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `)
}

const INTENT_PREFIX_REGEX = /^(?:looking\s+(?:for|to)|need\s+(?:a|an|help\s+with|help\s+to)?|recommend\s+(?:a|an)?|recommendations?\s+for|help\s+with|search(?:ing)?\s+for|seeking)\s+/i

/**
 * Expand only a reviewed, deliberately small alias list. The downstream
 * buying-signal and promotional-noise gates still have to pass, so aliases do
 * not turn broad topical mentions into opportunities by themselves.
 */
export function containsConfiguredPhraseOrAlias(
  text: string | null | undefined,
  phrase: string | null | undefined,
): boolean {
  if (containsConfiguredPhrase(text, phrase)) return true

  const normalizedPhrase = normalize(phrase)
  const aliases = CONTROLLED_PHRASE_ALIASES[normalizedPhrase] ?? []
  if (aliases.some(alias => containsConfiguredPhrase(text, alias))) return true

  // Strip conversational intent wrappers and articles so users who enter
  // "looking for digital marketing agency" or "recommend a marketing agency"
  // match the underlying service phrase (downstream hasBuyingSignal still guarantees commercial intent).
  const corePhrase = extractCoreSearchPhrase(phrase)
  if (corePhrase && corePhrase !== normalizedPhrase && corePhrase.length >= 3) {
    if (containsConfiguredPhrase(text, corePhrase)) return true
    const coreAliases = CONTROLLED_PHRASE_ALIASES[corePhrase] ?? []
    if (coreAliases.some(alias => containsConfiguredPhrase(text, alias))) return true
  }

  return false
}

export function extractCoreSearchPhrase(phrase: string | null | undefined): string {
  const normalized = normalize(phrase)
  const core = normalized
    .replace(INTENT_PREFIX_REGEX, '')
    .replace(/\b(?:our|my|the|a|an)\s+/g, '')
    .trim()
  return core && core.length >= 3 ? core : normalized
}

