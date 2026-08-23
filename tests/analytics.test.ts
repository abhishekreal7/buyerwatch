import { afterEach, describe, expect, it, vi } from 'vitest'

const { vercelTrack } = vi.hoisted(() => ({
  vercelTrack: vi.fn(),
}))

vi.mock('@vercel/analytics', () => ({
  track: vercelTrack,
}))

import { trackEvent } from '../src/lib/analytics'

describe('product analytics events', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends product events through the installed Vercel Analytics client', () => {
    trackEvent('reply_posted', {
      thread_id: 'thread-123',
      platform: 'reddit',
      is_edited: false,
    })

    expect(vercelTrack).toHaveBeenCalledWith('reply_posted', {
      thread_id: 'thread-123',
      platform: 'reddit',
      is_edited: false,
    })
  })
})
