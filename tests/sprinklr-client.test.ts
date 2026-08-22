import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { redis } from '../src/lib/redis'
import {
  fetchSprinklrRedditAccount,
  fetchSprinklrRedditPosts,
  postSprinklrRedditReply,
  SprinklrRequestError,
} from '../src/lib/sprinklr-client'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function streamPayload() {
  return {
    status: 'SUCCESS',
    response: {
      data: [{
        sourceId: -1,
        sourceType: 'LISTENING',
        snType: 'REDDIT',
        snMsgId: 't3_abc123',
        messageType: 2,
        snCreatedTime: 1_777_000_000_000,
        permalink: 'https://www.reddit.com/r/SaaS/comments/abc123/need_help/',
        message: 'I need a better invoicing workflow.',
        locked: false,
        stickied: false,
        over18: false,
        senderProfile: {
          snId: 'reddit-user-channel-7',
          screenName: 'prospect-user',
        },
      }],
      hasMore: false,
    },
  }
}

beforeEach(() => {
  vi.stubEnv('SPRINKLR_API_BASE_URL', 'https://api3.sprinklr.com/prod9')
  vi.stubEnv('SPRINKLR_API_KEY', 'sprinklr-api-key')
  vi.stubEnv('SPRINKLR_ACCESS_TOKEN', 'sprinklr-access-token')
  vi.stubEnv('SPRINKLR_REDDIT_TOPIC_ID', '987654')
  vi.stubEnv('SPRINKLR_REDDIT_ACCOUNT_ID', '123456')
  vi.stubEnv('SPRINKLR_REDDIT_CHANNEL_ID', 'reddit-account-channel')
  vi.stubEnv('SPRINKLR_REDDIT_CAMPAIGN_ID', 'campaign-1')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Sprinklr Reddit provider', () => {
  it('normalizes Listening stream posts and caches the exact reply reference', async () => {
    const stored = new Map<string, string>()
    vi.spyOn(redis, 'get').mockImplementation(async key => stored.get(String(key)) ?? null as never)
    vi.spyOn(redis, 'set').mockImplementation(async (key, value) => {
      stored.set(String(key), String(value))
      return 'OK' as never
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(streamPayload()))
      .mockResolvedValueOnce(jsonResponse({ data: ['POST_4908765975'], errors: [] }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{
          id: '4908765975',
          status: 'PUBLISHED',
          permalink: 'https://www.reddit.com/r/SaaS/comments/abc123/need_help/reply789/',
        }],
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSprinklrRedditPosts('SaaS', 10)).resolves.toEqual([{
      platform: 'reddit',
      externalId: 'abc123',
      author: 'prospect-user',
      text: 'I need a better invoicing workflow.',
      url: 'https://www.reddit.com/r/SaaS/comments/abc123/',
      createdAt: new Date(1_777_000_000_000).toISOString(),
      sourceTarget: 'saas',
    }])

    await expect(postSprinklrRedditReply({
      postUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/',
      text: 'A useful, relevant response.',
      accountId: 123456,
      channelId: 'reddit-account-channel',
    })).resolves.toEqual({
      permalink: 'https://www.reddit.com/r/SaaS/comments/abc123/need_help/reply789/',
    })

    const streamBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(streamBody.filters).toEqual([{ dimension: 'TOPIC', filterValues: ['987654'] }])
    const replyBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(replyBody).toMatchObject({
      accountId: 123456,
      inReplyToMessageId: 'LISTENING_-1_1777000000000_REDDIT_2_t3_abc123',
      taxonomy: { campaignId: 'campaign-1' },
      toProfile: { channelType: 'REDDIT', channelId: 'reddit-user-channel-7' },
    })
    expect(replyBody).not.toHaveProperty('approval')
    expect(fetchMock.mock.calls).toHaveLength(3)
  })

  it('verifies the configured account is active and is a Reddit account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 123456,
        channelId: 'reddit-account-channel',
        channelType: 'REDDIT',
        displayName: 'Fluid-Mix4114',
        active: true,
        deleted: false,
      },
      errors: [],
    })))

    await expect(fetchSprinklrRedditAccount()).resolves.toEqual({
      accountId: 123456,
      channelId: 'reddit-account-channel',
      username: 'Fluid-Mix4114',
    })
  })

  it('never retries a write whose network outcome is unknown', async () => {
    vi.spyOn(redis, 'get').mockResolvedValue(null as never)
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as never)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(streamPayload()))
      .mockRejectedValueOnce(new TypeError('socket closed'))
    vi.stubGlobal('fetch', fetchMock)

    let caught: unknown
    try {
      await postSprinklrRedditReply({
        postUrl: 'https://www.reddit.com/r/SaaS/comments/abc123/',
        text: 'A useful, relevant response.',
        accountId: 123456,
        channelId: 'reddit-account-channel',
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(SprinklrRequestError)
    expect(caught).toMatchObject({
      code: 'sprinklr_delivery_outcome_unknown',
      retryable: false,
      deliveryUncertain: true,
    })
    expect(fetchMock.mock.calls).toHaveLength(2)
  })

  it('rejects non-Reddit source URLs instead of turning them into opportunities', async () => {
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as never)
    const payload = streamPayload()
    payload.response.data[0].permalink = 'https://example.com/r/SaaS/comments/abc123/'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)))

    await expect(fetchSprinklrRedditPosts('SaaS', 10)).resolves.toEqual([])
  })
})
