function normalizedTokens(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 1)
}

/** Prevent a broken draft template from publishing near-identical replies. */
export function areRepliesNearDuplicate(left: string, right: string): boolean {
  const leftTokens = normalizedTokens(left)
  const rightTokens = normalizedTokens(right)
  if (leftTokens.length < 5 || rightTokens.length < 5) return false

  const leftSet = new Set(leftTokens)
  const rightSet = new Set(rightTokens)
  let intersection = 0
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1
  }
  const union = new Set([...leftSet, ...rightSet]).size
  const jaccard = union > 0 ? intersection / union : 0
  const lengthRatio = Math.min(leftTokens.length, rightTokens.length)
    / Math.max(leftTokens.length, rightTokens.length)

  return jaccard >= 0.88 && lengthRatio >= 0.8
}
