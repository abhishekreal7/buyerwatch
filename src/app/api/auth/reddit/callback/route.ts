import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { timingSafeEqual } from 'crypto'
import { encrypt } from '@/lib/encryption'
import { fetchWithTimeout } from '@/lib/http'
import { getAppUrl } from '@/lib/app-url'

const OAUTH_STATE_COOKIE = 'reddit_oauth_state'

function safeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state')

  if (error || !code) {
    return NextResponse.redirect(new URL('/settings?error=reddit_auth_failed', req.url))
  }

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value

  // One-time use: clear immediately so the state cannot be replayed
  cookieStore.delete(OAUTH_STATE_COOKIE)

  if (!state || !expectedState || !safeEqual(state, expectedState)) {
    return NextResponse.redirect(new URL('/settings?error=reddit_state_mismatch', req.url))
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const clientId = (process.env.REDDIT_OAUTH_CLIENT_ID || process.env.REDDIT_CLIENT_ID || '').trim()
  const clientSecret = (process.env.REDDIT_OAUTH_SECRET || process.env.REDDIT_CLIENT_SECRET || '').trim()
  const redirectUri = `${getAppUrl()}/api/auth/reddit/callback`

  // Developer Bypass
  if (process.env.NODE_ENV === 'development' && code === 'developer_code') {
    const accessObj = {
      token: 'developer_access_token',
      expires_at: Date.now() + 3600 * 1000
    }
    const { error: bypassError } = await supabase.from('platform_connections').upsert({
      user_id: user.id,
      platform: 'reddit',
      access_token: encrypt(JSON.stringify(accessObj)),
      refresh_token: encrypt('developer_refresh_token'),
      external_username: 'developer_reddit_user',
      connected_at: new Date().toISOString()
    }, { onConflict: 'user_id, platform' })
    if (bypassError) {
      return NextResponse.redirect(new URL('/settings?error=reddit_save_failed', req.url))
    }

    return NextResponse.redirect(new URL('/settings?success=reddit_connected', req.url))
  }

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/settings?error=reddit_credentials_missing', req.url))
  }
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const tokenRes = await fetchWithTimeout('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT || 'buyerwatch/1.0',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  }, 10_000)

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/settings?error=reddit_token_failed', req.url))
  }

  const tokenData = await tokenRes.json()

  // get identity
  const meRes = await fetchWithTimeout('https://oauth.reddit.com/api/v1/me', {
    headers: { 
      'Authorization': `Bearer ${tokenData.access_token}`,
      'User-Agent': process.env.REDDIT_USER_AGENT || 'buyerwatch/1.0',
    }
  }, 10_000)
  if (!meRes.ok) {
    return NextResponse.redirect(new URL('/settings?error=reddit_identity_failed', req.url))
  }
  const meData = await meRes.json()

  // Save to DB
  const accessObj = {
    token: tokenData.access_token,
    expires_at: Date.now() + tokenData.expires_in * 1000
  }

  const { error: saveError } = await supabase.from('platform_connections').upsert({
    user_id: user.id,
    platform: 'reddit',
    access_token: encrypt(JSON.stringify(accessObj)),
    refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
    external_username: meData.name,
    connected_at: new Date().toISOString()
  }, { onConflict: 'user_id, platform' })
  if (saveError) {
    return NextResponse.redirect(new URL('/settings?error=reddit_save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/settings?success=reddit_connected', req.url))
}
