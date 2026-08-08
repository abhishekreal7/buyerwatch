import { getConfiguredSecret } from './env'
import { fetchWithTimeout } from './http'
import {
  parseRedditCommentResponse,
  parseRedditApisListingPage,
  parseRedditLoginResponse,
  parseRedditPostTarget,
  providerMessageSignalsExpiredSession,
  type RedditCommentResult,
  type RedditLoginResult,
  type RedditApisListingPost,
  type RedditSessionCookies,
} from './redditapis-contract'

const REDDITAPIS_BASE_URL = 'https://api.redditapis.com'
const MAX_PROVIDER_RESPONSE_BYTES = 256_000

export class RedditApisRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
    public readonly deliveryUncertain = false,
    public readonly reauthRequired = false,
  ) {
    super(code)
    this.name = 'RedditApisRequestError'
  }
}

function getApiKey(): string {
  const key = getConfiguredSecret(process.env.REDDITAPIS_API_KEY)
  if (!key) {
    throw new RedditApisRequestError('reddit_provider_not_configured', null, false)
  }
  return key
}

function safeProviderPath(path: string): string {
  if (
    !path.startsWith('/')
    || path.startsWith('//')
    || path.includes('://')
    || !(path.startsWith('/api/') || path.startsWith('/account/'))
  ) {
    throw new RedditApisRequestError('reddit_provider_path_invalid', null, false)
  }
  return path
}

async function readProviderJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new RedditApisRequestError('reddit_provider_response_too_large', response.status, false)
  }

  if (!response.body) return null
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let raw = ''
  let bytesRead = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      if (bytesRead > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel()
        throw new RedditApisRequestError('reddit_provider_response_too_large', response.status, false)
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
  } catch (error) {
    if (error instanceof RedditApisRequestError) throw error
    throw new RedditApisRequestError('reddit_provider_response_unreadable', response.status, false)
  } finally {
    reader.releaseLock()
  }

  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new RedditApisRequestError('reddit_provider_response_invalid', response.status, false)
  }
}

export async function redditApisFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
  options: { writeOperation?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${getApiKey()}`)
  headers.set('Accept', 'application/json')
  headers.set('Cache-Control', 'no-cache')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    return await fetchWithTimeout(
      `${REDDITAPIS_BASE_URL}${safeProviderPath(path)}`,
      { ...init, headers },
      timeoutMs,
    )
  } catch (error) {
    if (error instanceof RedditApisRequestError) throw error
    throw new RedditApisRequestError(
      options.writeOperation
        ? 'reddit_delivery_outcome_unknown'
        : 'reddit_provider_unreachable',
      null,
      !options.writeOperation,
      options.writeOperation === true,
    )
  }
}

export async function loginRedditAccount(input: {
  username: string
  password: string
  totpSecret?: string
}): Promise<RedditLoginResult> {
  const response = await redditApisFetch('/api/reddit/login', {
    method: 'POST',
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      method: 'browser',
      ...(input.totpSecret ? { totp_secret: input.totpSecret } : {}),
    }),
  }, 45_000)
  const payload = await readProviderJson(response)

  if (!response.ok) {
    if (response.status === 401) {
      throw new RedditApisRequestError('reddit_credentials_or_2fa_rejected', 401, false)
    }
    if (response.status === 402) {
      throw new RedditApisRequestError('reddit_provider_balance_unavailable', 402, false)
    }
    if (response.status === 429 || response.status >= 500) {
      throw new RedditApisRequestError('reddit_provider_temporarily_unavailable', response.status, true)
    }
    throw new RedditApisRequestError('reddit_connection_rejected', response.status, false)
  }

  try {
    return parseRedditLoginResponse(payload)
  } catch {
    throw new RedditApisRequestError('reddit_connection_response_invalid', response.status, false)
  }
}

export async function fetchRedditAccountProfile(username: string): Promise<{
  createdAt: string | null
  linkKarma: number | null
  commentKarma: number | null
}> {
  const response = await redditApisFetch(`/api/reddit/user/${encodeURIComponent(username)}`, {
    method: 'GET',
  })
  const payload = await readProviderJson(response)
  if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RedditApisRequestError(
      response.status >= 500 ? 'reddit_provider_temporarily_unavailable' : 'reddit_profile_unavailable',
      response.status,
      response.status === 429 || response.status >= 500,
    )
  }
  const profile = payload as Record<string, unknown>
  const rawCreated = typeof profile.created === 'string' ? profile.created : ''
  const createdAt = rawCreated && Number.isFinite(Date.parse(rawCreated))
    ? new Date(rawCreated).toISOString()
    : typeof profile.created_utc === 'number' && Number.isFinite(profile.created_utc)
      ? new Date(profile.created_utc * 1_000).toISOString()
      : null
  const toInteger = (value: unknown) => {
    const number = Number(value)
    return Number.isSafeInteger(number) ? number : null
  }
  return {
    createdAt,
    linkKarma: toInteger(profile.link_karma),
    commentKarma: toInteger(profile.comment_karma),
  }
}

export async function fetchRedditPostSnapshot(postUrl: string): Promise<RedditApisListingPost> {
  const target = parseRedditPostTarget(postUrl)
  if (!target) {
    throw new RedditApisRequestError('reddit_post_url_invalid', null, false)
  }
  let after: string | null = null
  let lastStatus = 200

  // Busy communities can publish more than 100 posts between discovery and
  // delivery. Follow a bounded number of cursors so a valid fresh lead does
  // not become a false negative, while keeping latency and paid reads capped.
  for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
    const params = new URLSearchParams({
      subreddit: target.subreddit,
      sort: 'new',
      limit: '100',
      ...(after ? { after } : {}),
    })
    const response = await redditApisFetch(`/api/reddit/posts?${params.toString()}`, {
      method: 'GET',
    })
    lastStatus = response.status
    const payload = await readProviderJson(response)
    if (!response.ok) {
      throw new RedditApisRequestError(
        response.status === 429 || response.status >= 500
          ? 'reddit_provider_temporarily_unavailable'
          : 'reddit_post_preflight_failed',
        response.status,
        response.status === 429 || response.status >= 500,
      )
    }

    const page = parseRedditApisListingPage(payload)
    const post = page.posts.find(candidate => candidate.id === target.postId)
    if (post) return post
    if (!page.after || page.after === after) break
    after = page.after
  }

  throw new RedditApisRequestError('reddit_post_not_found_during_preflight', lastStatus, false)
}

export async function fetchRedditApisAccountStatus(timeoutMs = 2_500): Promise<{
  creditsRemaining: number
}> {
  const response = await redditApisFetch('/account/me', { method: 'GET' }, timeoutMs)
  const payload = await readProviderJson(response)
  if (!response.ok) {
    throw new RedditApisRequestError(
      response.status === 429 || response.status >= 500
        ? 'reddit_provider_temporarily_unavailable'
        : 'reddit_provider_authentication_failed',
      response.status,
      response.status === 429 || response.status >= 500,
    )
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RedditApisRequestError('reddit_provider_response_invalid', response.status, false)
  }
  const creditsRemaining = Number((payload as Record<string, unknown>).credits_remaining)
  if (!Number.isFinite(creditsRemaining) || creditsRemaining < 0) {
    throw new RedditApisRequestError('reddit_provider_response_invalid', response.status, false)
  }
  return { creditsRemaining }
}

export async function postRedditApisComment(input: {
  postUrl: string
  text: string
  cookies: RedditSessionCookies
}): Promise<RedditCommentResult> {
  const target = parseRedditPostTarget(input.postUrl)
  if (!target) {
    throw new RedditApisRequestError('reddit_post_url_invalid', null, false)
  }

  const response = await redditApisFetch('/api/reddit/v2/comment', {
    method: 'POST',
    body: JSON.stringify({
      post_url: target.canonicalUrl,
      text: input.text,
      ...input.cookies,
    }),
  }, 45_000, { writeOperation: true })
  let payload: unknown
  try {
    payload = await readProviderJson(response)
  } catch {
    // Once a write request has reached the provider, an unreadable response
    // cannot prove that Reddit rejected it. Never retry this state: place the
    // send in reconciliation so a user action cannot create a duplicate.
    throw new RedditApisRequestError(
      'reddit_delivery_outcome_unknown',
      response.status,
      false,
      true,
    )
  }

  if (!response.ok) {
    const reauthRequired = providerMessageSignalsExpiredSession(payload)
    if (response.status === 402) {
      throw new RedditApisRequestError('reddit_provider_balance_unavailable', 402, false)
    }
    if (response.status === 429) {
      throw new RedditApisRequestError('reddit_rate_limited', 429, true)
    }
    if (response.status === 401 || response.status === 403) {
      throw new RedditApisRequestError('reddit_provider_authentication_failed', response.status, false)
    }
    if (response.status >= 500) {
      throw new RedditApisRequestError(
        reauthRequired ? 'reddit_reconnect_required' : 'reddit_delivery_outcome_unknown',
        response.status,
        false,
        !reauthRequired,
        reauthRequired,
      )
    }
    throw new RedditApisRequestError(
      reauthRequired ? 'reddit_reconnect_required' : 'reddit_comment_rejected',
      response.status,
      false,
      false,
      reauthRequired,
    )
  }

  try {
    return parseRedditCommentResponse(payload)
  } catch {
    const reauthRequired = providerMessageSignalsExpiredSession(payload)
    throw new RedditApisRequestError(
      reauthRequired ? 'reddit_reconnect_required' : 'reddit_delivery_outcome_unknown',
      response.status,
      false,
      !reauthRequired,
      reauthRequired,
    )
  }
}
