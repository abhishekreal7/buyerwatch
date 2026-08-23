import { describe, expect, it } from 'vitest'
import {
  getKeywordPollIssueLabel,
  isKeywordPollDelayed,
  summarizeKeywordPollHealth,
} from '../src/lib/monitoring-health'

const now = Date.parse('2026-08-20T18:00:00.000Z')
const staleAfterMs = 25 * 60_000

describe('monitoring health presentation', () => {
  it('does not present a recent failed attempt as a successful source check', () => {
    const summary = summarizeKeywordPollHealth([{
      last_checked_at: '2026-08-20T17:58:00.000Z',
      last_success_at: null,
      last_check_status: 'error',
      last_check_error: 'provider_balance_unavailable',
    }], staleAfterMs, now)

    expect(summary).toEqual({
      activeRules: 1,
      delayedRules: 1,
      lastAttemptAt: '2026-08-20T17:58:00.000Z',
      lastSuccessfulAt: null,
    })
  })

  it('marks successful checks as delayed when their heartbeat is stale', () => {
    expect(isKeywordPollDelayed({
      last_checked_at: '2026-08-20T17:00:00.000Z',
      last_success_at: '2026-08-20T17:00:00.000Z',
      last_check_status: 'success',
    }, staleAfterMs, now)).toBe(true)
  })

  it('uses a user-safe status instead of exposing provider billing internals', () => {
    expect(getKeywordPollIssueLabel('provider_balance_unavailable')).toBe(
      'Reddit source unavailable',
    )
    expect(getKeywordPollIssueLabel('source_rate_limited')).toBe('Source rate-limited')
    expect(getKeywordPollIssueLabel('reddit_rss_fallback')).toBe('Reddit fallback active')
  })
})
