export type RedditAutoSendEligibility = {
  eligible: boolean
  code: 'eligible'
    | 'profile_unavailable'
    | 'account_age_unverified'
    | 'account_too_new'
    | 'karma_below_minimum'
  minimumAgeDays: number
  minimumCombinedKarma: number
  accountAgeDays: number | null
  combinedKarma: number | null
  daysRemaining: number
  karmaRemaining: number
}

function boundedIntegerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(process.env[name])
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

export function evaluateRedditAutoSendEligibility(input: {
  accountCreatedAt: string | null
  linkKarma: number | null
  commentKarma: number | null
  nowMs?: number
}): RedditAutoSendEligibility {
  const minimumAgeDays = boundedIntegerEnvironment(
    'REDDIT_AUTO_MIN_ACCOUNT_AGE_DAYS',
    30,
    7,
    365,
  )
  const minimumCombinedKarma = boundedIntegerEnvironment(
    'REDDIT_AUTO_MIN_COMBINED_KARMA',
    50,
    0,
    100_000,
  )
  const nowMs = input.nowMs ?? Date.now()
  const createdAtMs = Date.parse(input.accountCreatedAt ?? '')
  const accountAgeDays = Number.isFinite(createdAtMs)
    ? Math.max(0, Math.floor((nowMs - createdAtMs) / 86_400_000))
    : null
  const combinedKarma = input.linkKarma === null || input.commentKarma === null
    ? null
    : input.linkKarma + input.commentKarma
  const base = {
    minimumAgeDays,
    minimumCombinedKarma,
    accountAgeDays,
    combinedKarma,
    daysRemaining: accountAgeDays === null ? minimumAgeDays : Math.max(0, minimumAgeDays - accountAgeDays),
    karmaRemaining: combinedKarma === null
      ? minimumCombinedKarma
      : Math.max(0, minimumCombinedKarma - combinedKarma),
  }

  if (
    !input.accountCreatedAt
    || input.linkKarma === null
    || input.commentKarma === null
  ) return { ...base, eligible: false, code: 'profile_unavailable' }
  if (accountAgeDays === null) {
    return { ...base, eligible: false, code: 'account_age_unverified' }
  }
  if (accountAgeDays < minimumAgeDays) {
    return { ...base, eligible: false, code: 'account_too_new' }
  }
  if (combinedKarma === null || combinedKarma < minimumCombinedKarma) {
    return { ...base, eligible: false, code: 'karma_below_minimum' }
  }
  return { ...base, eligible: true, code: 'eligible', daysRemaining: 0, karmaRemaining: 0 }
}
