import { NormalizedPost } from './types'
import { isDevelopmentMockEnabled } from './env'
import { fetchWithTimeout } from './http'
import { redis } from './redis'

const APPVIEW_HOSTS = [
  'https://public.api.bsky.app',
  'https://api.bsky.app',
] as const

type BlueskySearchPost = {
  uri: string
  author: {
    did?: string
    handle?: string
  }
  record?: {
    text?: string
    createdAt?: string
  }
  indexedAt?: string
}

type BlueskySearchResponse = {
  posts?: BlueskySearchPost[]
}

export async function searchBlueskyPosts(query: string, limit: number = 25): Promise<NormalizedPost[]> {
  if (isDevelopmentMockEnabled('USE_MOCK_BLUESKY')) {
    return [
      {
        platform: 'bluesky',
        externalId: `mock-bsky-${Date.now()}`,
        author: 'mock_user.bsky.social',
        text: `This is a mock Bluesky post matching query: ${query}`,
        url: 'https://bsky.app/profile/mock_user.bsky.social/post/mock_post',
        createdAt: new Date().toISOString(),
        sourceTarget: query
      }
    ]
  }

  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 100)
  const cacheKey = `search:bluesky:${normalizedQuery.toLocaleLowerCase()}:${boundedLimit}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as NormalizedPost[]
  } catch {
    // Monitoring remains available if Redis has a transient cache failure.
  }

  let payload: BlueskySearchResponse | null = null
  let failureStatus = 503
  for (const host of APPVIEW_HOSTS) {
    const url = new URL('/xrpc/app.bsky.feed.searchPosts', host)
    url.searchParams.set('q', normalizedQuery)
    url.searchParams.set('limit', String(boundedLimit))
    url.searchParams.set('sort', 'latest')

    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BuyerWatch/1.0 (support@buyerwatch.co)',
      },
    }, 15_000)
    if (response.ok) {
      payload = await response.json() as BlueskySearchResponse
      break
    }

    failureStatus = response.status
    // The cached public hostname can be unavailable in some regions. The
    // canonical AppView is an official fallback; rate limits are not bypassed.
    if (![401, 403, 404].includes(response.status) && response.status < 500) break
  }
  if (!payload) {
    throw new Error(`Bluesky public search failed (${failureStatus})`)
  }

  const posts = (payload.posts ?? []).flatMap((post): NormalizedPost[] => {
    const postId = post.uri.split('/').at(-1)
    const profile = post.author.did || post.author.handle
    if (!postId || !profile) return []

    const authorHandle = post.author.handle || profile

    return [{
      platform: 'bluesky',
      externalId: post.uri,
      author: authorHandle,
      text: post.record?.text || '',
      url: `https://bsky.app/profile/${profile}/post/${postId}`,
      createdAt: post.record?.createdAt || post.indexedAt || new Date().toISOString(),
      sourceTarget: normalizedQuery,
    }]
  })

  await redis.set(cacheKey, JSON.stringify(posts), 'EX', 120).catch(() => {})
  return posts
}
