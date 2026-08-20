import { describe, expect, it } from 'vitest'
import {
  AUTO_REPLY_MAX_AGE_MS,
  DISCOVERY_MAX_AGE_MS,
  evaluateContentFreshness,
} from '../src/lib/content-freshness'
import { areRepliesNearDuplicate } from '../src/lib/reply-similarity'

describe('source freshness gates', () => {
  const nowMs = Date.parse('2026-08-20T12:00:00.000Z')

  it('accepts a recent source publication time', () => {
    expect(evaluateContentFreshness('2026-08-20T11:00:00.000Z', { nowMs })).toMatchObject({
      fresh: true,
    })
  })

  it('rejects content outside the discovery window', () => {
    expect(evaluateContentFreshness(
      new Date(nowMs - DISCOVERY_MAX_AGE_MS - 1).toISOString(),
      { nowMs },
    )).toEqual({ fresh: false, reason: 'source_too_old' })
  })

  it('uses the stricter automatic-reply window at send time', () => {
    expect(evaluateContentFreshness('2026-08-19T11:00:00.000Z', {
      nowMs,
      maxAgeMs: AUTO_REPLY_MAX_AGE_MS,
    })).toEqual({ fresh: false, reason: 'source_too_old' })
  })

  it('rejects missing and implausibly future timestamps', () => {
    expect(evaluateContentFreshness('', { nowMs })).toEqual({
      fresh: false,
      reason: 'invalid_source_time',
    })
    expect(evaluateContentFreshness('2026-08-20T13:00:00.000Z', { nowMs })).toEqual({
      fresh: false,
      reason: 'source_time_in_future',
    })
  })
})
describe('automatic reply duplication guard', () => {
  it('blocks near-identical templated replies', () => {
    expect(areRepliesNearDuplicate(
      'I had the same issue. BuyerWatch helped us monitor Reddit discussions and respond with useful context.',
      'I had the same issue! BuyerWatch helped us monitor Reddit discussions and respond with useful context.',
    )).toBe(true)
  })

  it('allows genuinely different contextual replies', () => {
    expect(areRepliesNearDuplicate(
      'For first customers, interview five founders and narrow the painful workflow before choosing a channel.',
      'You can reduce restaurant labor variance by forecasting demand from covers and historical shift data.',
    )).toBe(false)
  })
})
