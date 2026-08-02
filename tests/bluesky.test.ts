import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { redisGet, redisSet } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}))

vi.mock('../src/lib/redis', () => ({
  redis: {
    get: redisGet,
    set: redisSet,
  },
}))

import { searchBlueskyPosts } from '../src/lib/bluesky'

describe('public Bluesky discovery', () => {
  beforeEach(() => {
    redisGet.mockResolvedValue(null)
    redisSet.mockResolvedValue('OK')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('searches the public AppView without account credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      posts: [{
        uri: 'at://did:plc:buyer/app.bsky.feed.post/3abc',
        author: {
          did: 'did:plc:buyer',
          handle: 'buyer.bsky.social',
        },
        record: {
          text: 'Looking for a better lead generation tool',
          createdAt: '2026-08-02T10:00:00.000Z',
        },
      }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const posts = await searchBlueskyPosts('lead generation', 25)

    expect(fetchMock).toHaveBeenCalledOnce()
    const requestUrl = String(fetchMock.mock.calls[0][0])
    expect(requestUrl).toContain('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts')
    expect(requestUrl).toContain('q=lead+generation')
    expect(posts).toEqual([{
      platform: 'bluesky',
      externalId: 'at://did:plc:buyer/app.bsky.feed.post/3abc',
      author: 'buyer.bsky.social',
      text: 'Looking for a better lead generation tool',
      url: 'https://bsky.app/profile/did:plc:buyer/post/3abc',
      createdAt: '2026-08-02T10:00:00.000Z',
      sourceTarget: 'lead generation',
    }])
    expect(redisSet).toHaveBeenCalledWith(
      'search:bluesky:lead generation:25',
      JSON.stringify(posts),
      'EX',
      120,
    )
  })

  it('returns cached public results without another network request', async () => {
    const cached = [{
      platform: 'bluesky' as const,
      externalId: 'at://cached',
      author: 'cached.bsky.social',
      text: 'cached',
      url: 'https://bsky.app/profile/cached.bsky.social/post/cached',
      createdAt: '2026-08-02T10:00:00.000Z',
      sourceTarget: 'buyer intent',
    }]
    redisGet.mockResolvedValue(JSON.stringify(cached))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchBlueskyPosts('buyer intent')).resolves.toEqual(cached)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the canonical AppView when the cached host is region-blocked', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ posts: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchBlueskyPosts('buyer intent')).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts',
    )
  })

  it('surfaces public API failures for the scheduler retry path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))

    await expect(searchBlueskyPosts('buyer intent')).rejects.toThrow(
      'Bluesky public search failed (429)',
    )
  })
})
