import { describe, expect, it } from 'vitest'
import { keywordPollErrorCode } from '../src/lib/keyword-poll-health'

describe('keywordPollErrorCode', () => {
  it.each([
    ['x_search_400:invalid query', 'x_query_invalid'],
    ['x_search_401:request failed', 'provider_auth_failed'],
    ['x_search_402:CreditsDepleted', 'x_credits_exhausted'],
    ['x_search_403:client forbidden', 'x_access_denied'],
    ['x_search_429:rate limit exceeded', 'source_rate_limited'],
  ])('maps %s to %s', (message, expected) => {
    expect(keywordPollErrorCode(new Error(message))).toBe(expected)
  })
})
