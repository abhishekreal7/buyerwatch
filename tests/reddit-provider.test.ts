import { describe, expect, it } from 'vitest'
import { normalizeRedditApisPosts, parseRedditRss } from '../src/lib/reddit'
import {
  parseRedditApisListing,
  parseRedditApisListingPage,
  parseRedditCommentResponse,
  parseRedditLoginResponse,
  parseRedditPostTarget,
  RedditApisContractError,
} from '../src/lib/redditapis-contract'

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
