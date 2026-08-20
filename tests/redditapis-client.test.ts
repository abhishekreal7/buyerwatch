import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRedditApisAccountStatus,
  fetchRedditPostSnapshot,
  getRedditApisDailyBudgetStatus,
  postRedditApisComment,
  RedditApisRequestError,
} from '../src/lib/redditapis-client'
import { redis } from '../src/lib/redis'

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

  it('requires reconnection when Reddit rejects an expired provider session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      error: 'Reddit session cookie expired; log in again',
    }, 403)))

    await expect(postRedditApisComment({
      postUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
      text: 'Helpful reply',
      cookies: { reddit_session: 'session', loid: 'loid' },
    })).rejects.toMatchObject({
      code: 'reddit_reconnect_required',
      retryable: false,
      deliveryUncertain: false,
      reauthRequired: true,
    })
  })

  it('treats a non-session 403 as a definitive comment rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      error: 'You may not comment in this community',
    }, 403)))

    await expect(postRedditApisComment({
      postUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
      text: 'Helpful reply',
      cookies: { reddit_session: 'session', loid: 'loid' },
    })).rejects.toMatchObject({
      code: 'reddit_comment_rejected',
      retryable: false,
      deliveryUncertain: false,
      reauthRequired: false,
    })
  })

  it('does not accept provider proof for a different Reddit post', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      comment_id: 't1_reply123',
      permalink: 'https://www.reddit.com/r/SaaS/comments/other1/a-title/reply123/',
    })))

    await expect(postRedditApisComment({
      postUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
      text: 'Helpful reply',
      cookies: { reddit_session: 'session', loid: 'loid' },
    })).rejects.toMatchObject({
      code: 'reddit_delivery_outcome_unknown',
      retryable: false,
      deliveryUncertain: true,
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

  it('blocks paid reads before the provider call when the daily budget is exhausted', async () => {
    vi.stubEnv('REDDITAPIS_BUDGET_GUARD_ENABLED', 'true')
    vi.spyOn(redis, 'eval').mockResolvedValue(-1 as never)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchRedditPostSnapshot(
      'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
    )).rejects.toMatchObject({
      code: 'reddit_provider_daily_read_budget_exhausted',
      retryable: false,
      deliveryUncertain: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not classify a preflight write-budget block as uncertain delivery', async () => {
    vi.stubEnv('REDDITAPIS_BUDGET_GUARD_ENABLED', 'true')
    vi.spyOn(redis, 'eval').mockResolvedValue(-1 as never)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(postRedditApisComment({
      postUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/a-title/',
      text: 'Helpful reply',
      cookies: { reddit_session: 'session', loid: 'loid' },
    })).rejects.toMatchObject({
      code: 'reddit_provider_daily_write_budget_exhausted',
      retryable: false,
      deliveryUncertain: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the free provider account check outside paid request budgets', async () => {
    vi.stubEnv('REDDITAPIS_BUDGET_GUARD_ENABLED', 'true')
    const budgetSpy = vi.spyOn(redis, 'eval')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      credits_remaining: 2.5,
    })))

    await expect(fetchRedditApisAccountStatus()).resolves.toEqual({ creditsRemaining: 2.5 })
    expect(budgetSpy).not.toHaveBeenCalled()
  })

  it('reports shared daily budget usage without consuming another paid call', async () => {
    vi.stubEnv('REDDITAPIS_BUDGET_GUARD_ENABLED', 'true')
    vi.stubEnv('REDDITAPIS_MAX_DAILY_READ_CALLS', '25')
    vi.stubEnv('REDDITAPIS_MAX_DAILY_WRITE_CALLS', '4')
    vi.spyOn(redis, 'mget').mockResolvedValue(['7', '2'] as never)
    const budgetSpy = vi.spyOn(redis, 'eval')

    await expect(getRedditApisDailyBudgetStatus()).resolves.toEqual({
      read: { used: 7, limit: 25 },
      write: { used: 2, limit: 4 },
    })
    expect(budgetSpy).not.toHaveBeenCalled()
  })

  it('uses separate account and read circuits so one cannot reset the other', async () => {
    vi.stubEnv('REDDITAPIS_CIRCUIT_BREAKER_ENABLED', 'true')
    vi.spyOn(redis, 'get').mockResolvedValue(null as never)
    const delSpy = vi.spyOn(redis, 'del').mockResolvedValue(1 as never)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ credits_remaining: 2.5 }))
      .mockResolvedValueOnce(jsonResponse({
        posts: [{
          id: 'abc123',
          author: 'prospect',
          subreddit: 'SaaS',
          url: 'https://www.reddit.com/r/SaaS/comments/abc123/',
          created: '2026-08-20T08:00:00.000Z',
          locked: false,
          stickied: false,
          over_18: false,
        }],
        after: null,
      })))

    await fetchRedditApisAccountStatus()
    await fetchRedditPostSnapshot('https://www.reddit.com/r/SaaS/comments/abc123/a-title/')

    expect(delSpy).toHaveBeenCalledWith(
      'circuit:redditapis:account:failures:v2',
      'circuit:redditapis:account:open:v2',
    )
    expect(delSpy).toHaveBeenCalledWith(
      'circuit:redditapis:read:failures:v2',
      'circuit:redditapis:read:open:v2',
    )
  })
})
