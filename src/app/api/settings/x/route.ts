import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canMonitorPlatform } from '@/lib/plan-limits'
import { redis } from '@/lib/redis'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'

const callbackUrl = () => new URL('/api/settings/x/callback', process.env.NEXT_PUBLIC_SITE_URL || 'https://www.buyerwatch.co').toString()
const b64url = (value: Buffer) => value.toString('base64url')

/** Starts OAuth with a one-time server-side PKCE verifier. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', callbackUrl()))
  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
  if (!canMonitorPlatform(profile?.plan, 'x')) return NextResponse.redirect(new URL('/settings?section=connections&x=plan_required', callbackUrl()))
  if (!process.env.X_OAUTH_CLIENT_ID || !process.env.X_OAUTH_STATE_SECRET) return NextResponse.redirect(new URL('/settings?section=connections&x=unavailable', callbackUrl()))
  const rate = await settingsRateLimit.limit(`x-connect:${user.id}:${await getIp()}`)
  if (!rate.success) return NextResponse.redirect(new URL('/settings?section=connections&x=rate_limited', callbackUrl()))
  const state = b64url(crypto.randomBytes(32)); const verifier = b64url(crypto.randomBytes(48))
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  await redis.set(`x-oauth:${state}`, JSON.stringify({ userId: user.id, verifier }), 'EX', 600)
  const auth = new URL('https://x.com/i/oauth2/authorize')
  auth.search = new URLSearchParams({ response_type: 'code', client_id: process.env.X_OAUTH_CLIENT_ID, redirect_uri: callbackUrl(), scope: 'tweet.read tweet.write users.read offline.access', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString()
  return NextResponse.redirect(auth)
}
