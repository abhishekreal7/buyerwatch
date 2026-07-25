import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from './encryption'
import { fetchWithTimeout } from './http'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class PlatformPostError extends Error {
  constructor(public platform: string, public responseBody: string, public retryable: boolean) {
    super(`Failed to post to ${platform}: ${responseBody}`)
    this.name = 'PlatformPostError'
  }
}

async function getDecryptedRedditConnection(userId: string) {
  const { data, error } = await supabase
    .from('platform_connections')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .eq('platform', 'reddit')
    .single()

  if (error || !data || !data.access_token || !data.refresh_token) {
    throw new Error('Reddit connection not found for user')
  }

  const decryptedAccess = decrypt(data.access_token)
  let accessToken = decryptedAccess
  let expiresAt = 0

  try {
    const parsed = JSON.parse(decryptedAccess)
    accessToken = parsed.token
    expiresAt = parsed.expires_at
  } catch {
    // Plain text legacy token fallback
  }

  return {
    accessToken,
    refreshToken: decrypt(data.refresh_token),
    expiresAt
  }
}

async function refreshRedditToken(userId: string, refreshToken: string) {
  const clientId = (process.env.REDDIT_OAUTH_CLIENT_ID || process.env.REDDIT_CLIENT_ID || '').trim()
  const clientSecret = (process.env.REDDIT_OAUTH_SECRET || process.env.REDDIT_CLIENT_SECRET || '').trim()

  if (process.env.NODE_ENV === 'development' && (!clientId || clientId.includes('TODO'))) {
    return 'developer_access_token'
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  
  const response = await fetchWithTimeout('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT || 'ScoutoBot/1.0',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  }, 10_000)

  if (!response.ok) {
    // If the refresh token is revoked or invalid, we clear it from DB to force reconnect
    if (response.status === 400 || response.status === 401) {
      await supabase
        .from('platform_connections')
        .delete()
        .eq('user_id', userId)
        .eq('platform', 'reddit')
    }
    throw new Error(`Failed to refresh Reddit token: ${response.statusText}`)
  }

  const data: any = await response.json()
  const newAccessToken = data.access_token
  const newRefreshToken = data.refresh_token || refreshToken

  const accessObj = {
    token: newAccessToken,
    expires_at: Date.now() + data.expires_in * 1000
  }

  await supabase
    .from('platform_connections')
    .update({
      access_token: encrypt(JSON.stringify(accessObj)),
      refresh_token: encrypt(newRefreshToken)
    })
    .eq('user_id', userId)
    .eq('platform', 'reddit')

  return newAccessToken
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
  
  if (redditApisKey && !redditApisKey.includes('TODO')) {
    console.log(`[reddit] Posting reply using redditapis.com proxy for thread ${threadExternalId}`)
    const response = await fetchWithTimeout('https://api.redditapis.com/api/comment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redditApisKey}`,
        'User-Agent': process.env.REDDIT_USER_AGENT || 'ScoutoBot/1.0',
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
        'User-Agent': process.env.REDDIT_USER_AGENT || 'ScoutoBot/1.0',
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

  if (redditApisKey && !redditApisKey.includes('TODO')) {
    console.log(`[reddit] Submitting post using redditapis.com proxy to r/${subreddit}`)
    const response = await fetchWithTimeout('https://api.redditapis.com/api/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redditApisKey}`,
        'User-Agent': process.env.REDDIT_USER_AGENT || 'ScoutoBot/1.0',
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
        'User-Agent': process.env.REDDIT_USER_AGENT || 'ScoutoBot/1.0',
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
