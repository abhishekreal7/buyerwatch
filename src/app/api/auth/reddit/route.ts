import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'

const OAUTH_STATE_COOKIE = 'reddit_oauth_state'

export async function GET() {
  const clientId = (process.env.REDDIT_OAUTH_CLIENT_ID || process.env.REDDIT_CLIENT_ID || '').trim()
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/reddit/callback`

  // Cryptographically random state, validated in the OAuth callback
  const state = randomBytes(32).toString('hex')

  const cookieStore = await cookies()
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  })

  // Developer Bypass: If credentials are missing in local development, simulate successful redirection
  if (!clientId || clientId.includes('TODO')) {
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.redirect(new URL(`/api/auth/reddit/callback?code=developer_code&state=${state}`, redirectUri))
    }
    return NextResponse.redirect(new URL('/settings?error=reddit_credentials_missing', redirectUri))
  }

  const params = new URLSearchParams({
    client_id: clientId || '',
    response_type: 'code',
    state,
    redirect_uri: redirectUri,
    duration: 'permanent',
    scope: 'identity submit',
  })

  return NextResponse.redirect(`https://www.reddit.com/api/v1/authorize?${params.toString()}`)
}
