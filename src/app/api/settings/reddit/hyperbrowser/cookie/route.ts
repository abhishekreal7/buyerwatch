import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getRedditPostingProviderKind } from '@/lib/env'
import { authRateLimit, getIp } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'
import { normalizeRedditUsername } from '@/lib/redditapis-contract'
import {
  importRedditSessionCookieToHyperbrowser,
  HyperbrowserRedditProvisioningError,
} from '@/lib/hyperbrowser-reddit-provisioning'
import { RedditConnectionStateError } from '@/lib/reddit-session'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    if (!isTrustedSameOriginMutation(request)) {
      return NextResponse.json({ error: 'untrusted_request_origin' }, { status: 403 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (getRedditPostingProviderKind() !== 'hyperbrowser') {
      return NextResponse.json({ error: 'hyperbrowser_not_configured' }, { status: 503 })
    }
    const rate = await authRateLimit.limit(`reddit-cookie-connect:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const body = await readJsonBody<Record<string, unknown>>(request, 8_192)
    const cookie = typeof body.cookie === 'string' ? body.cookie.trim() : ''
    if (!cookie) {
      return NextResponse.json({ error: 'reddit_cookie_required' }, { status: 400 })
    }
    const expectedUsername = typeof body.username === 'string' && body.username.trim()
      ? normalizeRedditUsername(body.username) ?? undefined
      : undefined

    const result = await importRedditSessionCookieToHyperbrowser({
      userId: user.id,
      cookieInput: cookie,
      expectedUsername,
    })

    return NextResponse.json({
      success: true,
      connection: {
        platform: 'reddit',
        external_username: result.username,
        status: 'active',
        provider: 'hyperbrowser',
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof HyperbrowserRedditProvisioningError) {
      console.warn('[settings/reddit/hyperbrowser/cookie] Provisioning rejected', {
        errorCode: error.code,
        retryable: error.retryable,
      })
      return NextResponse.json({ error: error.code }, {
        status: error.retryable ? 503 : 409,
      })
    }
    if (error instanceof RedditConnectionStateError) {
      return NextResponse.json({ error: error.code }, { status: 409 })
    }
    const errorCode = error instanceof Error ? error.message : 'unknown'
    console.error('[settings/reddit/hyperbrowser/cookie] Failed to import cookie', { errorCode })
    return NextResponse.json({ error: 'reddit_connection_failed' }, { status: 500 })
  }
}
