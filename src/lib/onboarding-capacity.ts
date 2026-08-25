export type OnboardingPhrase = {
  term: string
  platforms: string[]
}

export function normalizeRedditTarget(value: string): string {
  return value.trim().replace(/^r\//i, '')
}

export function redditTargetKey(value: string): string {
  return normalizeRedditTarget(value).toLowerCase()
}

export function validateRedditTarget(value: string): string | null {
  const target = normalizeRedditTarget(value)
  if (!target) return 'Enter a subreddit name.'
  if (!/^[A-Za-z0-9_]{2,21}$/.test(target)) {
    return 'Use only the subreddit name, without spaces or a URL.'
  }
  return null
}

export function countRequestedMonitoringRules(
  phrases: OnboardingPhrase[],
  redditTargets: string[],
  blueskyTargets: string[] = [],
): number {
  const validPhrases = phrases.filter(phrase => phrase.term.trim())
  return validPhrases.reduce((count, phrase) => {
    const redditRules = phrase.platforms.includes('reddit')
      ? Math.max(1, redditTargets.length)
      : 0
    const blueskyRules = phrase.platforms.includes('bluesky')
      ? Math.max(1, blueskyTargets.length)
      : 0
    return count + redditRules + blueskyRules
  }, 0)
}
