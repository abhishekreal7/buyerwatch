import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSubredditRssUrl,
  fetchSubredditNew,
  normalizeRedditApisPosts,
  parseRedditRss,
  shouldBackoffRedditRssStatus,
} from '../src/lib/reddit'
import {
  parseRedditApisListing,
  parseRedditApisListingPage,
  parseRedditCommentResponse,
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
  })

  it('backs off public RSS blocks without treating ordinary misses as throttling', () => {
    expect(shouldBackoffRedditRssStatus(403)).toBe(true)
    expect(shouldBackoffRedditRssStatus(429)).toBe(true)
    expect(shouldBackoffRedditRssStatus(404)).toBe(false)
    expect(shouldBackoffRedditRssStatus(500)).toBe(false)
  })

  it('uses the managed provider before RSS when discovery is explicitly enabled', async () => {
    vi.stubEnv('REDDITAPIS_API_KEY', 'provider-key')
    vi.stubEnv('REDDITAPIS_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_FORCE_LIVE', 'true')
    vi.spyOn(redis, 'get').mockResolvedValue(null as never)
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as never)

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      posts: [{
        id: 'abc123',
        title: 'Need a better invoicing workflow',
        text: 'Our current process takes hours every week.',
        author: 'buyer-account',
        permalink: '/r/SaaS/comments/abc123/need_help/',
        created: '2026-08-20T08:30:00.000Z',
      }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSubredditNew('SaaS')).resolves.toHaveLength(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'https://api.redditapis.com/api/reddit/posts?',
    )
    expect(fetchMock.mock.calls).toHaveLength(1)
  })

  it('uses RSS only after an enabled provider fails', async () => {
    vi.stubEnv('REDDITAPIS_API_KEY', 'provider-key')
    vi.stubEnv('REDDITAPIS_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_FORCE_LIVE', 'true')
    vi.spyOn(redis, 'get').mockResolvedValue(null as never)
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as never)
    vi.spyOn(redis, 'del').mockResolvedValue(1 as never)

    const rss = `
      <feed>
        <entry>
          <id>t3_abc123</id>
          <author><name>/u/buyer-account</name></author>
          <title>Need help choosing a CRM</title>
          <link href="https://www.reddit.com/r/SaaS/comments/abc123/need_help/" />
          <published>2026-08-20T08:30:00+00:00</published>
          <content type="html">Looking for recommendations</content>
        </entry>
      </feed>
    `
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'temporary failure' }, 503))
      .mockResolvedValueOnce(new Response(rss, {
        headers: { 'Content-Type': 'application/atom+xml' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSubredditNew('SaaS')).resolves.toHaveLength(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://api.redditapis.com/')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('https://www.reddit.com/r/saas/new/.rss')
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
})
