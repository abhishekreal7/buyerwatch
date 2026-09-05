import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSubredditRssUrl,
  buildSubredditRssUrls,
  fetchSubredditNew,
  fetchSubredditNewWithSource,
  normalizeRedditApisPosts,
  parseRedditRss,
  shouldBackoffRedditRssStatus,
} from '../src/lib/reddit'
import {
  parseRedditApisListing,
  parseRedditApisListingPage,
  parseRedditCommentResponse,
  parseRedditCommentIdFromPermalink,
  parseRedditDirectCommentReplies,
  parseRedditLoginResponse,
  parseRedditPostTarget,
  RedditApisContractError,
} from '../src/lib/redditapis-contract'
import { redis } from '../src/lib/redis'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Reddit provider contracts', () => {
  it('uses the canonical query-free newest-post Atom feed', () => {
    expect(buildSubredditRssUrl('saas')).toBe(
      'https://www.reddit.com/r/saas/new/.rss',
    )
    expect(buildSubredditRssUrl('build_in_public')).not.toContain('?')
    expect(buildSubredditRssUrls('saas')).toEqual([
      'https://www.reddit.com/r/saas/new/.rss',
    ])
  })

  it('backs off public RSS blocks without treating ordinary misses as throttling', () => {
    expect(shouldBackoffRedditRssStatus(403)).toBe(true)
    expect(shouldBackoffRedditRssStatus(429)).toBe(true)
    expect(shouldBackoffRedditRssStatus(404)).toBe(false)
    expect(shouldBackoffRedditRssStatus(500)).toBe(false)
  })

  it('uses modern RSS before the managed provider when discovery is enabled', async () => {
    vi.stubEnv('REDDITAPIS_API_KEY', 'provider-key')
    vi.stubEnv('REDDITAPIS_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_FORCE_LIVE', 'true')
    vi.spyOn(redis, 'get').mockResolvedValue(null as never)
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as never)
    vi.spyOn(redis, 'del').mockResolvedValue(1 as never)

    const fetchMock = vi.fn().mockResolvedValue(new Response(`
      <feed>
        <entry>
          <id>t3_abc123</id>
          <author><name>/u/buyer-account</name></author>
          <title>Need a better invoicing workflow</title>
          <link href="https://www.reddit.com/r/SaaS/comments/abc123/need_help/" />
          <published>2026-08-20T08:30:00+00:00</published>
          <content type="html">Our current process takes hours every week.</content>
        </entry>
      </feed>
    `, { headers: { 'Content-Type': 'application/atom+xml' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSubredditNew('SaaS')).resolves.toHaveLength(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'https://www.reddit.com/r/saas/new/.rss',
    )
    expect(fetchMock.mock.calls).toHaveLength(1)
  })

  it('uses the managed provider only after modern RSS fails', async () => {
    vi.stubEnv('REDDITAPIS_API_KEY', 'provider-key')
    vi.stubEnv('REDDITAPIS_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_FORCE_LIVE', 'true')
    vi.spyOn(redis, 'get').mockResolvedValue(null as never)
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as never)
    vi.spyOn(redis, 'del').mockResolvedValue(1 as never)

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({
        posts: [{
          id: 'abc123',
          title: 'Need help choosing a CRM',
          text: 'Looking for recommendations',
          author: 'buyer-account',
          permalink: '/r/SaaS/comments/abc123/need_help/',
          created: '2026-08-20T08:30:00.000Z',
        }],
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSubredditNew('SaaS')).resolves.toHaveLength(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://www.reddit.com/r/saas/new/.rss')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('https://api.redditapis.com/')
  })

  it('backs off after the single canonical modern RSS endpoint is throttled', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.spyOn(redis, 'get').mockResolvedValue(null as never)
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as never)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSubredditNewWithSource('SaaS', 25, {
      mode: 'rss_only',
    })).rejects.toThrow('All Reddit fetch paths failed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('backoff:rss:r:saas'),
      '1',
      'EX',
      900,
    )
  })

  it('uses the cached RSS fallback without attempting a paid read when capacity is paused', async () => {
    vi.stubEnv('REDDITAPIS_API_KEY', 'provider-key')
    vi.stubEnv('REDDITAPIS_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_FORCE_LIVE', 'true')
    vi.spyOn(redis, 'get').mockResolvedValue(JSON.stringify([{
      platform: 'reddit',
      externalId: 'abc123',
      author: 'buyer-account',
      text: 'Need help choosing a CRM',
      url: 'https://www.reddit.com/r/saas/comments/abc123/',
      createdAt: '2026-08-20T08:30:00.000Z',
      sourceTarget: 'saas',
    }]) as never)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSubredditNewWithSource('SaaS', 25, {
      mode: 'rss_only',
    })).resolves.toMatchObject({
      source: 'rss',
      posts: [{ externalId: 'abc123' }],
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches the full RSS page once and slices independently for each caller', async () => {
    let cachedFeed: string | null = null
    vi.spyOn(redis, 'get').mockImplementation(async (key) => (
      String(key).startsWith('rss:r:v3:saas') ? cachedFeed as never : null as never
    ))
    vi.spyOn(redis, 'set').mockImplementation(async (key, value) => {
      if (String(key).startsWith('rss:r:v3:saas')) cachedFeed = String(value)
      return 'OK' as never
    })
    vi.spyOn(redis, 'del').mockResolvedValue(1 as never)
    const fetchMock = vi.fn().mockResolvedValue(new Response(`
      <feed>
        <entry>
          <id>t3_abc123</id>
          <author><name>/u/first-buyer</name></author>
          <title>Need help choosing a CRM</title>
          <link href="https://www.reddit.com/r/SaaS/comments/abc123/first/" />
          <published>2026-08-20T08:30:00+00:00</published>
          <content type="html">Looking for recommendations</content>
        </entry>
        <entry>
          <id>t3_def456</id>
          <author><name>/u/second-buyer</name></author>
          <title>Looking for a reporting tool</title>
          <link href="https://www.reddit.com/r/SaaS/comments/def456/second/" />
          <published>2026-08-20T08:31:00+00:00</published>
          <content type="html">Comparing options this week</content>
        </entry>
      </feed>
    `, { headers: { 'Content-Type': 'application/atom+xml' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSubredditNewWithSource('SaaS', 1, {
      mode: 'rss_only',
    })).resolves.toMatchObject({ posts: [{ externalId: 'abc123' }] })
    await expect(fetchSubredditNewWithSource('SaaS', 25, {
      mode: 'rss_only',
    })).resolves.toMatchObject({
      posts: [{ externalId: 'abc123' }, { externalId: 'def456' }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats an empty valid Atom listing as a successful bounded source check', async () => {
    vi.spyOn(redis, 'get').mockResolvedValue(null as never)
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as never)
    vi.spyOn(redis, 'del').mockResolvedValue(1 as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<feed></feed>', {
      headers: { 'Content-Type': 'application/atom+xml' },
    })))

    await expect(fetchSubredditNewWithSource('SaaS', 25, {
      mode: 'rss_only',
    })).resolves.toEqual({ posts: [], source: 'rss' })
  })

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
      url: 'https://www.reddit.com/r/SaaS/comments/abc123/',
      createdAt: '2026-08-08T08:30:00.000Z',
      sourceTarget: 'SaaS',
    }])
  })

  it('rejects malformed provider posts instead of inventing timestamps or URLs', () => {
    expect(normalizeRedditApisPosts({ posts: [{ id: 'abc123' }] }, 'SaaS')).toEqual([])
    expect(normalizeRedditApisPosts({ data: { children: [] } }, 'SaaS')).toEqual([])
    expect(normalizeRedditApisPosts({ posts: [{
      id: 'abc123',
      title: 'External link post',
      author: 'buyer-account',
      url: 'https://example.com/not-a-reddit-post',
      created: '2026-08-08T08:30:00.000Z',
    }] }, 'SaaS')).toEqual([])
  })

  it('uses the canonical Reddit permalink instead of a link-post destination', () => {
    expect(normalizeRedditApisPosts({ posts: [{
      id: 'abc123',
      title: 'Need a workflow recommendation',
      author: 'buyer-account',
      permalink: '/r/SaaS/comments/abc123/need_help/',
      url: 'https://vendor.example/landing-page',
      created: '2026-08-08T08:30:00.000Z',
    }] }, 'SaaS')[0]?.url).toBe('https://www.reddit.com/r/SaaS/comments/abc123/')
  })

  it('drops RSS entries with invalid timestamps instead of making them look fresh', () => {
    const xml = `
      <feed>
        <entry>
          <id>t3_abc123</id>
          <author><name>/u/buyer-account</name></author>
          <title>Need help choosing a CRM</title>
          <link href="https://www.reddit.com/r/SaaS/comments/abc123/need_help/" />
          <published>not-a-timestamp</published>
          <content type="html">Looking for recommendations</content>
        </entry>
      </feed>
    `
    expect(parseRedditRss(xml, 'saas')).toEqual([])
  })

  it('accepts only canonical Reddit post targets', () => {
    expect(parseRedditPostTarget('https://www.reddit.com/r/SaaS/comments/abc123/a-title/')).toEqual({
      subreddit: 'SaaS',
      postId: 'abc123',
      canonicalUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/',
    })
    expect(parseRedditPostTarget('https://reddit.com.evil.test/r/SaaS/comments/abc123/title')).toBeNull()
    expect(parseRedditPostTarget('http://reddit.com/r/SaaS/comments/abc123/title')).toBeNull()
    expect(parseRedditPostTarget('https://www.reddit.com/user/example')).toBeNull()
  })

  it('requires the complete write-session cookie contract', () => {
    const login = parseRedditLoginResponse({
      success: true,
      username: 'buyer-account',
      link_karma: 4,
      comment_karma: 12,
      cookies: {
        reddit_session: 'encrypted-session-value',
        loid: 'long-lived-id',
        csrf_token: 'csrf',
      },
    })
    expect(login).toEqual({
      username: 'buyer-account',
      linkKarma: 4,
      commentKarma: 12,
      cookies: {
        reddit_session: 'encrypted-session-value',
        loid: 'long-lived-id',
        csrf_token: 'csrf',
      },
    })
    expect(() => parseRedditLoginResponse({
      success: true,
      username: 'buyer-account',
      cookies: { reddit_session: 'missing-loid' },
    })).toThrow(RedditApisContractError)
  })

  it('validates provider proof and preflight flags', () => {
    expect(parseRedditCommentResponse({
      success: true,
      comment_id: 't1_reply123',
      permalink: 'https://www.reddit.com/r/SaaS/comments/abc123/comment/reply123/',
    })).toEqual({
      commentId: 't1_reply123',
      permalink: 'https://www.reddit.com/r/SaaS/comments/abc123/comment/reply123/',
    })
    expect(() => parseRedditCommentResponse({
      success: true,
      comment_id: 'not-a-comment',
      permalink: 'https://evil.test/reply',
    })).toThrow(RedditApisContractError)

    expect(parseRedditApisListing({ posts: [{
      id: 'abc123',
      author: 'prospect',
      subreddit: 'SaaS',
      url: 'https://www.reddit.com/r/SaaS/comments/abc123/title/',
      created: '2026-08-08T08:30:00.000Z',
      locked: true,
      stickied: false,
      over_18: true,
    }] })[0]).toMatchObject({
      id: 'abc123',
      locked: true,
      stickied: false,
      over18: true,
    })

    expect(parseRedditApisListingPage({
      posts: [],
      after: 't3_next123',
    })).toEqual({ posts: [], after: 't3_next123' })
    expect(parseRedditApisListingPage({
      posts: [],
      after: 'https://evil.test/cursor',
    }).after).toBeNull()
  })

  it('extracts only real comment permalinks and keeps only direct external replies', () => {
    expect(parseRedditCommentIdFromPermalink(
      'https://www.reddit.com/r/SaaS/comments/abc123/comment/reply123/',
    )).toBe('t1_reply123')
    expect(parseRedditCommentIdFromPermalink(
      'https://www.reddit.com/r/SaaS/comments/abc123/a-title/reply123/',
    )).toBe('t1_reply123')
    expect(parseRedditCommentIdFromPermalink(
      'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
    )).toBeNull()

    expect(parseRedditDirectCommentReplies({
      kind: 'Listing',
      data: {
        children: [{
          kind: 't1',
          data: {
            id: 'firstreply',
            parent_id: 't1_outgoing',
            author: 'real-person',
            created_utc: 1_786_000_000,
            replies: {
              data: {
                children: [{
                  kind: 't1',
                  data: {
                    id: 'nestedreply',
                    parent_id: 't1_firstreply',
                    author: 'another-person',
                  },
                }],
              },
            },
          },
        }, {
          kind: 't1',
          data: {
            id: 'deletedreply',
            parent_id: 't1_outgoing',
            author: '[deleted]',
          },
        }],
      },
    }, 't1_outgoing')).toEqual([{
      commentId: 't1_firstreply',
      author: 'real-person',
      createdAt: '2026-08-06T07:06:40.000Z',
    }])
  })
})
