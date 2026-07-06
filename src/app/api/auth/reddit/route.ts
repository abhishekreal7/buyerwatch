import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.REDDIT_OAUTH_CLIENT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/reddit/callback`
  
  const params = new URLSearchParams({
    client_id: clientId || '',
    response_type: 'code',
    state: 'random_state_string_scouto', // Simplified for demo
    redirect_uri: redirectUri,
    duration: 'permanent',
    scope: 'identity submit'
  })

  return NextResponse.redirect(`https://www.reddit.com/api/v1/authorize?${params.toString()}`)
}
