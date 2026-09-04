import { describe, expect, it } from 'vitest'
import { evaluateRedditAutoSendEligibility } from '../src/lib/reddit-auto-send-eligibility'

const NOW = Date.parse('2026-08-29T00:00:00.000Z')

describe('Reddit automatic-delivery eligibility', () => {
  it('reports both remaining age and karma without weakening the safety gate', () => {
    expect(evaluateRedditAutoSendEligibility({
      accountCreatedAt: '2026-08-22T00:00:00.000Z',
      linkKarma: 1,
      commentKarma: 0,
      nowMs: NOW,
    })).toEqual(expect.objectContaining({
      eligible: false,
      code: 'account_too_new',
      accountAgeDays: 7,
      combinedKarma: 1,
      daysRemaining: 23,
      karmaRemaining: 49,
    }))
  })

  it('allows automatic delivery only after both requirements are met', () => {
    expect(evaluateRedditAutoSendEligibility({
      accountCreatedAt: '2026-07-01T00:00:00.000Z',
      linkKarma: 25,
      commentKarma: 25,
      nowMs: NOW,
    })).toEqual(expect.objectContaining({ eligible: true, code: 'eligible' }))
  })
})
