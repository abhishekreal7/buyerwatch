import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'

const OAUTH_STATE_COOKIE = 'reddit_oauth_state'

export async function GET() {
  const clientId = process.env.REDDIT_OAUTH_CLIENT_ID
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
