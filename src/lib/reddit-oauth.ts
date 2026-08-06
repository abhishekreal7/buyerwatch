import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from './encryption'
import { fetchWithTimeout } from './http'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function safeRedditApiPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error('Invalid Reddit API path')
  }
  return path
}

export async function getDecryptedRedditConnection(userId: string) {
  const { data, error } = await getSupabase()
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
    expiresAt,
  }
}

export async function refreshRedditToken(userId: string, refreshToken: string) {
  const clientId = (process.env.REDDIT_OAUTH_CLIENT_ID || process.env.REDDIT_CLIENT_ID || '').trim()
  const clientSecret = (process.env.REDDIT_OAUTH_SECRET || process.env.REDDIT_CLIENT_SECRET || '').trim()

  if (process.env.NODE_ENV === 'development' && (!clientId || clientId.includes('TODO'))) {
    return 'developer_access_token'
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetchWithTimeout('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT || 'BuyerWatchBot/1.0',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  }, 10_000)

  if (!response.ok) {
    // An invalid refresh token cannot recover on its own. Disconnect it so the
    // customer is prompted to authorise Reddit again instead of retrying forever.
    if (response.status === 400 || response.status === 401) {
      await getSupabase()
        .from('platform_connections')
        .delete()
        .eq('user_id', userId)
        .eq('platform', 'reddit')
    }
    throw new Error(`Failed to refresh Reddit token: ${response.statusText}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }
  if (!data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new Error('Reddit returned an invalid token refresh response')
  }
  const newRefreshToken = data.refresh_token || refreshToken
  const accessObj = {
    token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1_000,
  }

  await getSupabase()
    .from('platform_connections')
    .update({
      access_token: encrypt(JSON.stringify(accessObj)),
      refresh_token: encrypt(newRefreshToken),
    })
    .eq('user_id', userId)
    .eq('platform', 'reddit')

  return data.access_token
}

/** Make an authenticated, user-scoped Reddit API request. */
export async function redditApiFetchForUser(
  userId: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const apiPath = safeRedditApiPath(path)
  const connection = await getDecryptedRedditConnection(userId)
  let accessToken = connection.accessToken
  const { refreshToken, expiresAt } = connection

  if (expiresAt && Date.now() + 300_000 >= expiresAt) {
    accessToken = await refreshRedditToken(userId, refreshToken)
  }

  const request = (token: string) => {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('User-Agent', process.env.REDDIT_USER_AGENT || 'BuyerWatchBot/1.0')
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')

    return fetchWithTimeout(`https://oauth.reddit.com${apiPath}`, {
      ...init,
      headers,
    }, timeoutMs)
  }

  let response = await request(accessToken)
  if (response.status === 401) {
    accessToken = await refreshRedditToken(userId, refreshToken)
    response = await request(accessToken)
  }

  return response
}
