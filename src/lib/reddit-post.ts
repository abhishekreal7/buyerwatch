import { fetchWithTimeout } from './http'
import { getDecryptedRedditConnection, refreshRedditToken } from './reddit-oauth'

export { redditApiFetchForUser } from './reddit-oauth'

export class PlatformPostError extends Error {
  constructor(public platform: string, public responseBody: string, public retryable: boolean) {
    super(`Failed to post to ${platform}: ${responseBody}`)
    this.name = 'PlatformPostError'
  }
}

function configured(value: string | undefined): boolean {
  const normalized = value?.trim() ?? ''
  return Boolean(normalized && !normalized.includes('TODO'))
}

export function isRedditDirectPostingConfigured(): boolean {
  const paidProxy = process.env.REDDITAPIS_FALLBACK_ENABLED === 'true'
    && configured(process.env.REDDITAPIS_API_KEY)
  const oauth = process.env.REDDIT_DIRECT_POSTING_ENABLED === 'true'
    && configured(process.env.REDDIT_OAUTH_CLIENT_ID || process.env.REDDIT_CLIENT_ID)
    && configured(process.env.REDDIT_OAUTH_SECRET || process.env.REDDIT_CLIENT_SECRET)
  return paidProxy || oauth
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
  const redditApisKey = (process.env.REDDITAPIS_API_KEY || '').trim()
  const paidFallbackEnabled = process.env.REDDITAPIS_FALLBACK_ENABLED === 'true'
  
  if (paidFallbackEnabled && redditApisKey && !redditApisKey.includes('TODO')) {
    console.log(`[reddit] Posting reply using redditapis.com proxy for thread ${threadExternalId}`)
    const response = await fetchWithTimeout('https://api.redditapis.com/api/comment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redditApisKey}`,
        'User-Agent': process.env.REDDIT_USER_AGENT || 'BuyerWatchBot/1.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        api_type: 'json',
        thing_id: threadExternalId,
        text
      })
    }, 10_000)

    handleRedditRateLimits(response.headers)

    if (!response.ok) {
      const errorText = await response.text()
      throw new PlatformPostError('reddit', errorText, response.status === 429 || response.status >= 500)
    }

    const data: any = await response.json()
    const errorMsg = parseRedditJsonError(data)
    if (errorMsg) {
      throw new PlatformPostError('reddit', errorMsg, errorMsg.includes('RATELIMIT'))
    }

    const permalink = data?.json?.data?.things?.[0]?.data?.permalink
    return { permalink: permalink ? `https://reddit.com${permalink}` : null }
  }

  const clientId = (process.env.REDDIT_OAUTH_CLIENT_ID || process.env.REDDIT_CLIENT_ID || '').trim()
  if (process.env.NODE_ENV === 'development' && (!clientId || clientId.includes('TODO'))) {
    await getDecryptedRedditConnection(userId)
    return { permalink: `https://reddit.com/r/developer/comments/${threadExternalId}/dev_reply` }
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
        thing_id: threadExternalId,
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
  const redditApisKey = (process.env.REDDITAPIS_API_KEY || '').trim()
  const paidFallbackEnabled = process.env.REDDITAPIS_FALLBACK_ENABLED === 'true'

  if (paidFallbackEnabled && redditApisKey && !redditApisKey.includes('TODO')) {
    console.log(`[reddit] Submitting post using redditapis.com proxy to r/${subreddit}`)
    const response = await fetchWithTimeout('https://api.redditapis.com/api/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redditApisKey}`,
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

    handleRedditRateLimits(response.headers)

    if (!response.ok) {
      const errorText = await response.text()
      throw new PlatformPostError('reddit', errorText, response.status === 429 || response.status >= 500)
    }

    const data: any = await response.json()
    const errorMsg = parseRedditJsonError(data)
    if (errorMsg) {
      throw new PlatformPostError('reddit', errorMsg, errorMsg.includes('RATELIMIT'))
    }

    const url = data?.json?.data?.url
    return { permalink: url || null }
  }

  const clientId = (process.env.REDDIT_OAUTH_CLIENT_ID || process.env.REDDIT_CLIENT_ID || '').trim()
  if (process.env.NODE_ENV === 'development' && (!clientId || clientId.includes('TODO'))) {
    await getDecryptedRedditConnection(userId)
    return { permalink: `https://reddit.com/r/developer/submit_mock` }
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
