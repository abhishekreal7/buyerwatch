import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  redisDel,
  redisGet,
  redisSet,
} = vi.hoisted(() => ({
  redisDel: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}))

vi.mock('../src/lib/redis', () => ({
  redis: {
    del: redisDel,
    get: redisGet,
    set: redisSet,
  },
}))

import { searchBlueskyPosts } from '../src/lib/bluesky'

describe('public Bluesky discovery', () => {
  beforeEach(() => {
    vi.stubEnv('BLUESKY_HANDLE', '')
    vi.stubEnv('BLUESKY_APP_PASSWORD', '')
    vi.stubEnv('ENCRYPTION_KEY', '1'.repeat(64))
    redisDel.mockResolvedValue(1)
    redisGet.mockResolvedValue(null)
    redisSet.mockResolvedValue('OK')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
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
      url: 'https://bsky.app/profile/did%3Aplc%3Abuyer/post/3abc',
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
      'Bluesky search failed (429)',
    )
  })

  it('uses the encrypted authenticated fallback when both public hosts reject search', async () => {
    vi.stubEnv('BLUESKY_HANDLE', 'buyerwatch.bsky.social')
    vi.stubEnv('BLUESKY_APP_PASSWORD', 'app-password')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        refreshJwt: 'refresh',
        accessJwt: 'access',
        handle: 'buyerwatch.bsky.social',
        did: 'did:plc:buyerwatch',
        active: true,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        posts: [{
          uri: 'at://did:plc:buyer/app.bsky.feed.post/3fallback',
          author: { handle: 'buyer.bsky.social', did: 'did:plc:buyer' },
          record: {
            text: 'Need help finding early customers',
            createdAt: '2026-08-20T10:00:00.000Z',
          },
        }],
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const posts = await searchBlueskyPosts('early customers')

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      'https://bsky.social/xrpc/com.atproto.server.createSession',
    )
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      identifier: 'buyerwatch.bsky.social',
      password: 'app-password',
    })
    expect(String(fetchMock.mock.calls[3][0])).toContain(
      'https://bsky.social/xrpc/app.bsky.feed.searchPosts',
    )
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get('Authorization')).toBe(
      'Bearer access',
    )
    expect(posts).toHaveLength(1)
    expect(redisSet).toHaveBeenCalledWith(
      'session:bluesky:discovery:v1',
      expect.any(String),
      'EX',
      7 * 24 * 60 * 60,
    )
  })

  it('drops malformed cached and source records instead of inventing timestamps', async () => {
    redisGet.mockResolvedValueOnce('[{"platform":"bluesky"}]')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      posts: [{
        uri: 'at://did:plc:buyer/app.bsky.feed.post/3abc',
        author: { did: 'did:plc:buyer' },
        record: { text: 'Missing source time' },
      }],
    }), { status: 200 })))

    await expect(searchBlueskyPosts('buyer intent')).resolves.toEqual([])
    expect(redisDel).toHaveBeenCalledWith('search:bluesky:buyer intent:25')
  })
})
