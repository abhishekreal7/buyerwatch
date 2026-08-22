export interface KeywordPollHealthRow {
  last_checked_at: string | null
  last_success_at: string | null
  last_check_status: string
  last_check_error?: string | null
}

function latestValidTimestamp(values: Array<string | null>): string | null {
  return values
    .filter((value): value is string => (
      typeof value === 'string' && Number.isFinite(Date.parse(value))
    ))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
}

export function isKeywordPollDelayed(
  row: KeywordPollHealthRow,
  staleAfterMs: number,
  nowMs = Date.now(),
): boolean {
  if (row.last_check_status !== 'success') return true
  const lastSuccessAt = Date.parse(row.last_success_at ?? '')
  return !Number.isFinite(lastSuccessAt) || nowMs - lastSuccessAt > staleAfterMs
}

export function summarizeKeywordPollHealth(
  rows: KeywordPollHealthRow[],
  staleAfterMs: number,
  nowMs = Date.now(),
) {
  return {
    activeRules: rows.length,
    delayedRules: rows.filter(row => isKeywordPollDelayed(row, staleAfterMs, nowMs)).length,
    lastAttemptAt: latestValidTimestamp(rows.map(row => row.last_checked_at)),
    lastSuccessfulAt: latestValidTimestamp(rows.map(row => row.last_success_at)),
  }
}

export function getKeywordPollIssueLabel(errorCode: string | null | undefined): string {
  switch (errorCode) {
    case 'provider_balance_unavailable':
    case 'reddit_sources_unavailable':
      return 'Reddit source unavailable'
    case 'bluesky_source_unavailable':
      return 'Bluesky source unavailable'
    case 'provider_budget_exhausted':
      return 'Source daily limit reached'
    case 'provider_budget_guard_unavailable':
      return 'Source safety check unavailable'
    case 'provider_circuit_open':
      return 'Source temporarily paused'
    case 'source_rate_limited':
      return 'Source rate-limited'
    case 'source_timeout':
      return 'Source timed out'
    case 'provider_auth_failed':
      return 'Source authentication failed'
    case 'reddit_rss_fallback':
      return 'Reddit fallback active'
    default:
      return 'Source check failed'
  }
}
