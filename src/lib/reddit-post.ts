import { fetchWithTimeout } from './http'
import { getDecryptedRedditConnection, refreshRedditToken } from './reddit-oauth'
import { hasRedditPostingProvider } from './env'

export { redditApiFetchForUser } from './reddit-oauth'

export class PlatformPostError extends Error {
  constructor(public platform: string, public responseBody: string, public retryable: boolean) {
    super(`Failed to post to ${platform}: ${responseBody}`)
    this.name = 'PlatformPostError'
  }
}

export function isRedditDirectPostingConfigured(): boolean {
  return hasRedditPostingProvider()
}

export function normalizeRedditThingId(value: string): string {
  const normalized = value.trim()
  if (/^t[13]_[a-z0-9]+$/i.test(normalized)) return normalized
  if (/^[a-z0-9]+$/i.test(normalized)) return `t3_${normalized}`
  throw new PlatformPostError('reddit', 'Invalid Reddit post identifier.', false)
}

function handleRedditRateLimits(headers: Headers) {
  const remaining = headers.get('x-ratelimit-remaining')
  const reset = headers.get('x-ratelimit-reset')
  
  if (remaining && Number(remaining) === 0) {
    const resetSeconds = reset ? Number(reset) : 60
    throw new PlatformPostError('reddit', `Rate limit exceeded. Resets in ${resetSeconds}s.`, true)
  }
}

function parseRedditJsonError(data: any): string | null {
  if (data?.json?.errors && data.json.errors.length > 0) {
    const errorDetails = data.json.errors.map((err: any[]) => {
      const [code, message, field] = err
      return `${code}: ${message}${field ? ` (${field})` : ''}`
    })
    return errorDetails.join(', ')
  }
  return null
}

export async function postRedditReply(userId: string, threadExternalId: string, text: string) {
  const clientId = (process.env.REDDIT_OAUTH_CLIENT_ID || process.env.REDDIT_CLIENT_ID || '').trim()
  if (process.env.NODE_ENV === 'development' && (!clientId || clientId.includes('TODO'))) {
    await getDecryptedRedditConnection(userId)
    return { permalink: `https://reddit.com/r/developer/comments/${threadExternalId}/dev_reply` }
  }
  if (!isRedditDirectPostingConfigured()) {
    throw new PlatformPostError('reddit', 'Direct Reddit posting is not configured.', false)
  }

  const connection = await getDecryptedRedditConnection(userId)
  let accessToken = connection.accessToken
  const { refreshToken, expiresAt } = connection

  // Proactive Refresh: refresh if token expires in less than 5 minutes
  if (expiresAt && Date.now() + 300_000 >= expiresAt) {
    try {
      accessToken = await refreshRedditToken(userId, refreshToken)
    } catch (e: any) {
      throw new PlatformPostError('reddit', `Failed to proactively refresh token: ${e.message}`, false)
    }
  }

  const tryPost = async (token: string) => {
    return await fetchWithTimeout('https://oauth.reddit.com/api/comment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': process.env.REDDIT_USER_AGENT || 'BuyerWatchBot/1.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        api_type: 'json',
        thing_id: normalizeRedditThingId(threadExternalId),
        text
      })
    }, 10_000)
  }

  let response = await tryPost(accessToken)

  // Automatic Refresh on 401
  if (response.status === 401) {
    try {
      accessToken = await refreshRedditToken(userId, refreshToken)
      response = await tryPost(accessToken)
    } catch (e: any) {
      throw new PlatformPostError('reddit', `Authentication failed after token refresh attempt: ${e.message}`, false)
    }
  }

  handleRedditRateLimits(response.headers)

  if (!response.ok) {
    const errorText = await response.text()
    const isRetryable = response.status === 429 || response.status >= 500
    throw new PlatformPostError('reddit', errorText, isRetryable)
  }

  const data: any = await response.json()
  const errorMsg = parseRedditJsonError(data)
  if (errorMsg) {
    const isRetryable = errorMsg.includes('RATELIMIT')
    throw new PlatformPostError('reddit', errorMsg, isRetryable)
  }

  const permalink = data?.json?.data?.things?.[0]?.data?.permalink
  return { permalink: permalink ? `https://reddit.com${permalink}` : null }
}

export async function submitRedditPost(userId: string, subreddit: string, title: string, text: string) {
  const clientId = (process.env.REDDIT_OAUTH_CLIENT_ID || process.env.REDDIT_CLIENT_ID || '').trim()
  if (process.env.NODE_ENV === 'development' && (!clientId || clientId.includes('TODO'))) {
    await getDecryptedRedditConnection(userId)
    return { permalink: `https://reddit.com/r/developer/submit_mock` }
  }
  if (!isRedditDirectPostingConfigured()) {
    throw new PlatformPostError('reddit', 'Direct Reddit posting is not configured.', false)
  }

  const connection = await getDecryptedRedditConnection(userId)
  let accessToken = connection.accessToken
  const { refreshToken, expiresAt } = connection

  if (expiresAt && Date.now() + 300_000 >= expiresAt) {
    try {
      accessToken = await refreshRedditToken(userId, refreshToken)
    } catch (e: any) {
      throw new PlatformPostError('reddit', `Failed to proactively refresh token: ${e.message}`, false)
    }
  }

  const trySubmit = async (token: string) => {
    return await fetchWithTimeout('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': process.env.REDDIT_USER_AGENT || 'BuyerWatchBot/1.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        api_type: 'json',
        kind: 'self',
        sr: subreddit,
        title,
        text
      })
    }, 10_000)
  }

  let response = await trySubmit(accessToken)

  if (response.status === 401) {
    try {
      accessToken = await refreshRedditToken(userId, refreshToken)
      response = await trySubmit(accessToken)
    } catch (e: any) {
      throw new PlatformPostError('reddit', `Authentication failed after token refresh attempt: ${e.message}`, false)
    }
  }

  handleRedditRateLimits(response.headers)

  if (!response.ok) {
    const errorText = await response.text()
    const isRetryable = response.status === 429 || response.status >= 500
    throw new PlatformPostError('reddit', errorText, isRetryable)
  }

  const data: any = await response.json()
  const errorMsg = parseRedditJsonError(data)
  if (errorMsg) {
    const isRetryable = errorMsg.includes('RATELIMIT')
    throw new PlatformPostError('reddit', errorMsg, isRetryable)
  }

  const url = data?.json?.data?.url
  return { permalink: url || null }
}
