import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { timingSafeEqual } from 'crypto'
import { encrypt } from '@/lib/encryption'

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

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/reddit/callback`
  const basicAuth = Buffer.from(`${process.env.REDDIT_OAUTH_CLIENT_ID}:${process.env.REDDIT_OAUTH_SECRET}`).toString('base64')

  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/settings?error=reddit_token_failed', req.url))
  }

  const tokenData = await tokenRes.json()

  // get identity
  const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  })
  const meData = await meRes.json()

  // Save to DB
  await supabase.from('platform_connections').upsert({
    user_id: user.id,
    platform: 'reddit',
    access_token: encrypt(tokenData.access_token),
    refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
    external_username: meData.name,
    connected_at: new Date().toISOString()
  }, { onConflict: 'user_id, platform' })

  return NextResponse.redirect(new URL('/settings?success=reddit_connected', req.url))
}
