import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from './encryption'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class PlatformPostError extends Error {
  constructor(public platform: string, public responseBody: string, public retryable: boolean) {
    super(`Failed to post to ${platform}`)
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

  return {
    accessToken: decrypt(data.access_token),
    refreshToken: decrypt(data.refresh_token)
  }
}

async function refreshRedditToken(userId: string, refreshToken: string) {
  const basicAuth = Buffer.from(`${process.env.REDDIT_OAUTH_CLIENT_ID}:${process.env.REDDIT_OAUTH_SECRET}`).toString('base64')
  
  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  })

  if (!response.ok) {
    throw new Error('Failed to refresh Reddit token')
  }

  const data: any = await response.json()
  const newAccessToken = data.access_token
  const newRefreshToken = data.refresh_token || refreshToken

  await supabase
    .from('platform_connections')
    .update({
      access_token: encrypt(newAccessToken),
      refresh_token: encrypt(newRefreshToken)
    })
    .eq('user_id', userId)
    .eq('platform', 'reddit')

  return newAccessToken
}

export async function postRedditReply(userId: string, threadExternalId: string, text: string) {
  let { accessToken, refreshToken } = await getDecryptedRedditConnection(userId)

  const tryPost = async (token: string) => {
    return await fetch('https://oauth.reddit.com/api/comment', {
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
    })
  }

  let response = await tryPost(accessToken)

  if (response.status === 401) {
    accessToken = await refreshRedditToken(userId, refreshToken)
    response = await tryPost(accessToken)
  }

  if (!response.ok) {
    const errorText = await response.text()
    const isRetryable = response.status === 429 || response.status >= 500
    throw new PlatformPostError('reddit', errorText, isRetryable)
  }

  const data: any = await response.json()
  
  if (data?.json?.errors?.length > 0) {
    const errorStr = JSON.stringify(data.json.errors)
    const isRetryable = errorStr.includes('RATELIMIT')
    throw new PlatformPostError('reddit', errorStr, isRetryable)
  }

  const permalink = data?.json?.data?.things?.[0]?.data?.permalink
  return { permalink: permalink ? `https://reddit.com${permalink}` : null }
}
