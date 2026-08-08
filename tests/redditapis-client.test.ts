import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRedditApisAccountStatus,
  fetchRedditPostSnapshot,
  postRedditApisComment,
  RedditApisRequestError,
} from '../src/lib/redditapis-client'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('RedditAPIs client reliability', () => {
  beforeEach(() => {
    vi.stubEnv('REDDITAPIS_API_KEY', 'test-provider-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('follows bounded listing cursors to preflight a busy subreddit', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        posts: [{
          id: 'old123',
          author: 'someone',
          subreddit: 'SaaS',
          url: 'https://www.reddit.com/r/SaaS/comments/old123/',
          created: '2026-08-08T08:00:00.000Z',
          locked: false,
          stickied: false,
          over_18: false,
        }],
        after: 't3_cursor1',
      }))
      .mockResolvedValueOnce(jsonResponse({
        posts: [{
          id: 'abc123',
          author: 'prospect',
          subreddit: 'SaaS',
          url: 'https://www.reddit.com/r/SaaS/comments/abc123/',
          created: '2026-08-08T07:50:00.000Z',
          locked: false,
          stickied: false,
          over_18: false,
        }],
        after: null,
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchRedditPostSnapshot(
      'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
    )).resolves.toMatchObject({ id: 'abc123', author: 'prospect' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('after=t3_cursor1')
  })

  it('stops when a provider repeats a pagination cursor', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({
      posts: [],
      after: 't3_repeat1',
    })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchRedditPostSnapshot(
      'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
    )).rejects.toMatchObject({ code: 'reddit_post_not_found_during_preflight' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('marks a network failure during comment delivery as uncertain and non-retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket closed')))

    const error = await postRedditApisComment({
      postUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
      text: 'Helpful reply',
      cookies: { reddit_session: 'session', loid: 'loid' },
    }).catch(value => value)

    expect(error).toBeInstanceOf(RedditApisRequestError)
    expect(error).toMatchObject({
      code: 'reddit_delivery_outcome_unknown',
      retryable: false,
      deliveryUncertain: true,
    })
  })

  it('marks an unreadable successful write response as uncertain and non-retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })))

    const error = await postRedditApisComment({
      postUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
      text: 'Helpful reply',
      cookies: { reddit_session: 'session', loid: 'loid' },
    }).catch(value => value)

    expect(error).toMatchObject({
      code: 'reddit_delivery_outcome_unknown',
      retryable: false,
      deliveryUncertain: true,
    })
  })

  it('retries a definitive rate-limit response without treating it as delivered', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'slow down' }, 429)))

    const error = await postRedditApisComment({
      postUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
      text: 'Helpful reply',
      cookies: { reddit_session: 'session', loid: 'loid' },
    }).catch(value => value)

    expect(error).toMatchObject({
      code: 'reddit_rate_limited',
      retryable: true,
      deliveryUncertain: false,
    })
  })

  it('validates provider account balance responses without exposing account details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      email: 'private@example.com',
      credits_remaining: 3.25,
      credits_used: 1.5,
    })))

    await expect(fetchRedditApisAccountStatus()).resolves.toEqual({ creditsRemaining: 3.25 })
  })
})
