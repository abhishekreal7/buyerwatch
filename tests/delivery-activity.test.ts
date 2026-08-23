import { describe, expect, it } from 'vitest'
import { deliveryActivityPresentation } from '../src/lib/delivery-activity'

describe('delivery activity presentation', () => {
  it('keeps technical provider errors out of customer-facing outcomes', () => {
    const failed = deliveryActivityPresentation({
      state: 'failed', threadId: 'thread-1', threadUrl: 'https://reddit.com/post', replyUrl: null,
    })
    expect(failed).toEqual({
      title: 'Reply was not sent',
      message: 'Nothing was posted. Review the draft before trying again.',
      actionLabel: 'Review reply',
      actionHref: '/dashboard?thread=thread-1',
    })
  })

  it('makes an uncertain Reddit write safe to resolve without duplicate posting', () => {
    const uncertain = deliveryActivityPresentation({
      state: 'uncertain', threadId: 'thread-1', threadUrl: 'https://reddit.com/post', replyUrl: null,
    })
    expect(uncertain.title).toBe('Reply needs verification')
    expect(uncertain.message).toContain('before retrying')
    expect(uncertain.actionHref).toBe('https://reddit.com/post')
  })
})
