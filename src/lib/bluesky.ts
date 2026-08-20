import { decrypt, encrypt } from './encryption'
import { getConfiguredSecret, isDevelopmentMockEnabled } from './env'
import { fetchWithTimeout, readResponseText } from './http'
import { redis } from './redis'
import { NormalizedPost } from './types'

const APPVIEW_HOSTS = [
  'https://public.api.bsky.app',
  'https://api.bsky.app',
] as const
const BLUESKY_ENTRYWAY = 'https://bsky.social'
const BLUESKY_SESSION_CACHE_KEY = 'session:bluesky:discovery:v1'
const BLUESKY_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_BLUESKY_RESPONSE_BYTES = 1_000_000

let authenticatedSessionPromise: Promise<BlueskySession> | null = null

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

type BlueskySession = {
  refreshJwt: string
  accessJwt: string
  handle: string
  did: string
  active: boolean
}

class BlueskyRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'BlueskyRequestError'
  }
}

function isBlueskySession(value: unknown): value is BlueskySession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const session = value as Partial<BlueskySession>
  return (
    typeof session.refreshJwt === 'string'
    && typeof session.accessJwt === 'string'
    && typeof session.handle === 'string'
    && typeof session.did === 'string'
    && typeof session.active === 'boolean'
  )
}

function isNormalizedPost(value: unknown): value is NormalizedPost {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const post = value as Partial<NormalizedPost>
  return (
    post.platform === 'bluesky'
    && typeof post.externalId === 'string'
    && typeof post.author === 'string'
    && typeof post.text === 'string'
    && typeof post.url === 'string'
    && typeof post.createdAt === 'string'
    && Number.isFinite(Date.parse(post.createdAt))
    && typeof post.sourceTarget === 'string'
  )
}

function parseCachedPosts(value: string): NormalizedPost[] | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) && parsed.every(isNormalizedPost) ? parsed : null
  } catch {
    return null
  }
}

function parseSearchPayload(value: unknown): BlueskySearchResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Bluesky search response was invalid')
  }
  const payload = value as Record<string, unknown>
  if (payload.posts !== undefined && !Array.isArray(payload.posts)) {
    throw new Error('Bluesky search response was invalid')
  }
  return payload as BlueskySearchResponse
}

async function readSearchPayload(response: Response): Promise<BlueskySearchResponse> {
  const raw = await readResponseText(response, MAX_BLUESKY_RESPONSE_BYTES)
  if (!raw.trim()) throw new Error('Bluesky search response was invalid')
  try {
    return parseSearchPayload(JSON.parse(raw) as unknown)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bluesky search response was invalid') {
      throw error
    }
    throw new Error('Bluesky search response was invalid', { cause: error })
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const raw = await readResponseText(response, MAX_BLUESKY_RESPONSE_BYTES)
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    throw new Error('Bluesky response was invalid', { cause: error })
  }
}

function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown
    }
    const expiresAt = Number(decoded.exp) * 1_000
    return Number.isFinite(expiresAt) ? expiresAt : null
  } catch {
    return null
  }
}

function accessTokenIsUsable(session: BlueskySession, now = Date.now()): boolean {
  const expiresAt = jwtExpiryMs(session.accessJwt)
  return expiresAt !== null && expiresAt - now > 2 * 60_000
}

function sessionCacheTtl(session: BlueskySession, now = Date.now()): number {
  const refreshExpiresAt = jwtExpiryMs(session.refreshJwt)
  if (refreshExpiresAt === null) return BLUESKY_SESSION_TTL_SECONDS
  return Math.max(
    60,
    Math.min(
      BLUESKY_SESSION_TTL_SECONDS,
      Math.floor((refreshExpiresAt - now - 60_000) / 1_000),
    ),
  )
}

async function persistDiscoverySession(session: BlueskySession): Promise<void> {
  await redis.set(
    BLUESKY_SESSION_CACHE_KEY,
    encrypt(JSON.stringify(session)),
    'EX',
    sessionCacheTtl(session),
  ).catch(() => undefined)
}

async function loadCachedDiscoverySession(): Promise<BlueskySession | null> {
  try {
    const cached = await redis.get(BLUESKY_SESSION_CACHE_KEY)
    if (!cached) return null
    const parsed = JSON.parse(decrypt(cached)) as unknown
    if (isBlueskySession(parsed)) return parsed
  } catch {
    // Corrupt or expired sessions are discarded and replaced by a fresh login.
  }
  await redis.del(BLUESKY_SESSION_CACHE_KEY).catch(() => undefined)
  return null
}

function parseSessionPayload(value: unknown): BlueskySession {
  if (!isBlueskySession(value)) throw new Error('Bluesky session response was invalid')
  return value
}

async function requestBlueskySession(
  path: '/xrpc/com.atproto.server.createSession' | '/xrpc/com.atproto.server.refreshSession',
  init: RequestInit,
): Promise<BlueskySession> {
  const response = await fetchWithTimeout(new URL(path, BLUESKY_ENTRYWAY), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  }, 15_000)
  const payload = await readJsonPayload(response)
  if (!response.ok) {
    throw new BlueskyRequestError(response.status, 'Bluesky session request failed')
  }
  const session = parseSessionPayload(payload)
  await persistDiscoverySession(session)
  return session
}

async function createBlueskySession(): Promise<BlueskySession> {
  const handle = getConfiguredSecret(process.env.BLUESKY_HANDLE)
  const password = getConfiguredSecret(process.env.BLUESKY_APP_PASSWORD)
  if (!handle || !password) {
    throw new Error('Bluesky authenticated search is not configured')
  }

  return requestBlueskySession('/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password }),
  })
}

async function refreshBlueskySession(session: BlueskySession): Promise<BlueskySession> {
  return requestBlueskySession('/xrpc/com.atproto.server.refreshSession', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.refreshJwt}` },
  })
}

async function createAuthenticatedDiscoverySession(): Promise<BlueskySession> {
  const cached = await loadCachedDiscoverySession()
  if (cached) {
    if (accessTokenIsUsable(cached)) return cached
    try {
      return await refreshBlueskySession(cached)
    } catch (error) {
      if (
        !(error instanceof BlueskyRequestError)
        || ![400, 401, 403].includes(error.status)
      ) {
        throw error
      }
    }
    await redis.del(BLUESKY_SESSION_CACHE_KEY).catch(() => undefined)
  }
  return createBlueskySession()
}

async function getAuthenticatedDiscoverySession(): Promise<BlueskySession> {
  if (!authenticatedSessionPromise) {
    authenticatedSessionPromise = createAuthenticatedDiscoverySession().catch((error) => {
      authenticatedSessionPromise = null
      throw error
    })
  }
  return authenticatedSessionPromise
}

async function searchWithAuthenticatedSession(
  query: string,
  limit: number,
): Promise<BlueskySearchResponse> {
  const search = async () => {
    const session = await getAuthenticatedDiscoverySession()
    const url = new URL('/xrpc/app.bsky.feed.searchPosts', BLUESKY_ENTRYWAY)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('sort', 'latest')
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.accessJwt}`,
        'User-Agent': 'BuyerWatch/1.0 (support@buyerwatch.co)',
      },
    }, 15_000)
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new BlueskyRequestError(response.status, 'Bluesky authenticated search failed')
    }
    return readSearchPayload(response)
  }

  try {
    return await search()
  } catch (error) {
    if (!(error instanceof BlueskyRequestError) || ![401, 403].includes(error.status)) {
      throw error
    }
    authenticatedSessionPromise = null
    await redis.del(BLUESKY_SESSION_CACHE_KEY).catch(() => undefined)
    return search()
  }
}

function normalizeSearchPosts(
  payload: BlueskySearchResponse,
  sourceTarget: string,
): NormalizedPost[] {
  return (payload.posts ?? []).flatMap((post): NormalizedPost[] => {
    if (
      typeof post.uri !== 'string'
      || !post.uri.startsWith('at://')
      || typeof post.author !== 'object'
      || post.author === null
    ) {
      return []
    }
    const postId = post.uri.split('/').at(-1)
    const profile = post.author.did || post.author.handle
    const createdAt = post.record?.createdAt || post.indexedAt
    if (
      !postId
      || !/^[a-z0-9]{1,80}$/i.test(postId)
      || !profile
      || profile.length > 253
      || !createdAt
      || !Number.isFinite(Date.parse(createdAt))
    ) {
      return []
    }

    const authorHandle = post.author.handle || profile
    return [{
      platform: 'bluesky',
      externalId: post.uri.slice(0, 1_000),
      author: authorHandle.slice(0, 253),
      text: (post.record?.text || '').slice(0, 10_000),
      url: `https://bsky.app/profile/${encodeURIComponent(profile)}/post/${encodeURIComponent(postId)}`,
      createdAt: new Date(createdAt).toISOString(),
      sourceTarget,
    }]
  })
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
    if (cached) {
      const posts = parseCachedPosts(cached)
      if (posts) return posts
      await redis.del(cacheKey).catch(() => undefined)
    }
  } catch {
    // Monitoring remains available if Redis has a transient cache failure.
  }

  let payload: BlueskySearchResponse | null = null
  let failureStatus = 503
  for (const host of APPVIEW_HOSTS) {
    const hostBackoffKey = `backoff:bluesky-appview:${new URL(host).hostname}`
    try {
      if (await redis.get(hostBackoffKey)) continue
    } catch {
      // Source fetching remains available during a cache incident.
    }
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
      payload = await readSearchPayload(response)
      break
    }

    failureStatus = response.status
    await response.body?.cancel().catch(() => undefined)
    if ([401, 403, 404].includes(response.status) || response.status >= 500) {
      await redis.set(
        hostBackoffKey,
        String(response.status),
        'EX',
        response.status >= 500 ? 120 : 15 * 60,
      ).catch(() => {})
    }
    // The cached public hostname can be unavailable in some regions. The
    // canonical AppView is an official fallback; rate limits are not bypassed.
    if (![401, 403, 404].includes(response.status) && response.status < 500) break
  }
  if (!payload) {
    try {
      payload = await searchWithAuthenticatedSession(normalizedQuery, boundedLimit)
    } catch (error) {
      throw new Error(`Bluesky search failed (${failureStatus})`, { cause: error })
    }
  }

  const posts = normalizeSearchPosts(payload, normalizedQuery)

  await redis.set(cacheKey, JSON.stringify(posts), 'EX', 120).catch(() => {})
  return posts
}
