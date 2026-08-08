import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { hasRedditPostingProvider } from '@/lib/env'
import { authRateLimit, getIp } from '@/lib/ratelimit'
import {
  boundedString,
  isTrustedSameOriginMutation,
  readJsonBody,
  RequestInputError,
} from '@/lib/request'
import {
  fetchRedditApisAccountStatus,
  fetchRedditAccountProfile,
  loginRedditAccount,
  RedditApisRequestError,
} from '@/lib/redditapis-client'
import { normalizeRedditUsername } from '@/lib/redditapis-contract'
import { saveRedditApisConnection } from '@/lib/reddit-session'

export const runtime = 'nodejs'

function normalizeTotpSecret(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') return null
  const normalized = value.toUpperCase().replace(/[\s-]/g, '')
  return /^[A-Z2-7]{16,128}={0,6}$/.test(normalized) ? normalized : null
}

function errorStatus(error: RedditApisRequestError): number {
  if (error.code === 'reddit_credentials_or_2fa_rejected') return 401
  if (error.status === 429) return 429
  if (error.code === 'reddit_provider_balance_unavailable') return 503
  if (error.retryable) return 503
  return 502
}

export async function POST(request: Request) {
  try {
    if (!isTrustedSameOriginMutation(request)) {
      return NextResponse.json({ error: 'untrusted_request_origin' }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasRedditPostingProvider()) {
      return NextResponse.json({ error: 'reddit_direct_posting_unavailable' }, { status: 503 })
    }

    const rate = await authRateLimit.limit(`reddit-connect:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const body = await readJsonBody<Record<string, unknown>>(request, 4_096)
    const username = normalizeRedditUsername(body.username)
    const password = boundedString(body.password, 512, { required: true, trim: false })
    const totpSecret = normalizeTotpSecret(body.totpSecret)
    if (!username || password === null || totpSecret === null) {
      return NextResponse.json({ error: 'invalid_reddit_credentials_format' }, { status: 400 })
    }

    const providerAccount = await fetchRedditApisAccountStatus()
    if (providerAccount.creditsRemaining < 0.012) {
      throw new RedditApisRequestError('reddit_provider_balance_unavailable', 402, false)
    }

    const login = await loginRedditAccount({
      username,
      password,
      ...(totpSecret ? { totpSecret } : {}),
    })

    // Profile enrichment is useful for connection health and future policy
    // checks, but a temporary read outage must not discard a valid login.
    const profile = await fetchRedditAccountProfile(login.username).catch(() => null)
    await saveRedditApisConnection({
      userId: user.id,
      login,
      accountCreatedAt: profile?.createdAt,
      linkKarma: profile?.linkKarma,
      commentKarma: profile?.commentKarma,
    })

    return NextResponse.json({
      success: true,
      connection: {
        platform: 'reddit',
        external_username: login.username,
        status: 'active',
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof RedditApisRequestError) {
      return NextResponse.json({ error: error.code }, { status: errorStatus(error) })
    }
    console.error('[settings/reddit] Connection failed')
    return NextResponse.json({ error: 'reddit_connection_failed' }, { status: 500 })
  }
}
