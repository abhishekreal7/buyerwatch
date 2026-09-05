import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getHyperbrowserRedditMaxConcurrency,
  getRedditDeliveryFlowControl,
  REDDIT_DELIVERY_FLOW_CONTROL_KEY,
} from '../src/lib/reddit-delivery-concurrency'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Reddit browser delivery capacity', () => {
  it('uses every slot allowed by the configured Hyperbrowser plan', () => {
    vi.stubEnv('HYPERBROWSER_REDDIT_MAX_CONCURRENCY', '1')
    expect(getRedditDeliveryFlowControl('reddit')).toEqual({
      key: REDDIT_DELIVERY_FLOW_CONTROL_KEY,
      parallelism: 1,
    })

    vi.stubEnv('HYPERBROWSER_REDDIT_MAX_CONCURRENCY', '25')
    expect(getRedditDeliveryFlowControl('reddit')).toEqual({
      key: REDDIT_DELIVERY_FLOW_CONTROL_KEY,
      parallelism: 25,
    })
  })

  it('defaults safely and rejects values outside supported plan limits', () => {
    expect(getHyperbrowserRedditMaxConcurrency()).toBe(1)
    expect(getHyperbrowserRedditMaxConcurrency('0')).toBe(1)
    expect(getHyperbrowserRedditMaxConcurrency('26')).toBe(1)
    expect(getHyperbrowserRedditMaxConcurrency('bad')).toBe(1)
  })

  it('does not throttle providers that do not consume browser capacity', () => {
    expect(getRedditDeliveryFlowControl('bluesky')).toBeUndefined()
    expect(getRedditDeliveryFlowControl('x')).toBeUndefined()
  })
})
