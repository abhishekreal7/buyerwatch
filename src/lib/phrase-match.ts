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

export function containsConfiguredPhrase(
  text: string | null | undefined,
  phrase: string | null | undefined,
): boolean {
  const normalizedText = normalize(text)
  const normalizedPhrase = normalize(phrase)
  if (!normalizedText || !normalizedPhrase) return false

  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `)
}
