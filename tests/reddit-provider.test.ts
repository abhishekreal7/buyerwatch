import { describe, expect, it } from 'vitest'
import { normalizeRedditThingId, PlatformPostError } from '../src/lib/reddit-post'
import { normalizeRedditApisPosts } from '../src/lib/reddit'

describe('Reddit provider contracts', () => {
  it('normalizes the current redditapis.com listing response shape', () => {
    expect(normalizeRedditApisPosts({
      posts: [{
        id: 'abc123',
        title: 'Need a better invoicing workflow',
        text: 'Our current process takes hours every week.',
        author: 'buyer-account',
        permalink: '/r/SaaS/comments/abc123/need_help/',
        created: '2026-08-08T08:30:00.000Z',
      }],
      after: null,
    }, 'SaaS')).toEqual([{
      platform: 'reddit',
      externalId: 'abc123',
      author: 'buyer-account',
      title: 'Need a better invoicing workflow',
      text: 'Need a better invoicing workflow\n\nOur current process takes hours every week.',
      url: 'https://reddit.com/r/SaaS/comments/abc123/need_help/',
      createdAt: '2026-08-08T08:30:00.000Z',
      sourceTarget: 'SaaS',
    }])
  })

  it('rejects malformed provider posts instead of inventing timestamps or URLs', () => {
    expect(normalizeRedditApisPosts({ posts: [{ id: 'abc123' }] }, 'SaaS')).toEqual([])
    expect(normalizeRedditApisPosts({ data: { children: [] } }, 'SaaS')).toEqual([])
  })

  it('uses Reddit fullnames for official comment delivery', () => {
    expect(normalizeRedditThingId('abc123')).toBe('t3_abc123')
    expect(normalizeRedditThingId('t3_abc123')).toBe('t3_abc123')
    expect(normalizeRedditThingId('t1_reply123')).toBe('t1_reply123')
    expect(() => normalizeRedditThingId('../bad')).toThrow(PlatformPostError)
  })
})
