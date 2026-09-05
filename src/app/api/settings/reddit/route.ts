import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getRedditPostingProviderKind } from '@/lib/env'
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
  REDDITAPIS_MINIMUM_OPERATIONAL_CREDITS,
  RedditApisRequestError,
} from '@/lib/redditapis-client'
import { normalizeRedditUsername } from '@/lib/redditapis-contract'
import {
  getHyperbrowserRedditConnectionForVerification,
  RedditConnectionStateError,
  saveHyperbrowserRedditConnection,
  saveRedditApisConnection,
  saveSprinklrRedditConnection,
} from '@/lib/reddit-session'
import { fetchHyperbrowserRedditAccountProfile, HyperbrowserRedditError } from '@/lib/hyperbrowser-reddit'
import {
  finishHyperbrowserRedditSignInSession,
  HyperbrowserRedditProvisioningError,
} from '@/lib/hyperbrowser-reddit-provisioning'
import {
  fetchSprinklrRedditAccount,
  SprinklrRequestError,
} from '@/lib/sprinklr-client'

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

function sprinklrErrorStatus(error: SprinklrRequestError): number {
  if (error.code === 'sprinklr_authentication_failed') return 401
  if (error.status === 429) return 429
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
    const provider = getRedditPostingProviderKind()
    if (!provider) {
      return NextResponse.json({ error: 'reddit_direct_posting_unavailable' }, { status: 503 })
    }

    const rate = await authRateLimit.limit(`reddit-connect:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }


    if (provider === 'sprinklr') {
      // The end user authorizes Reddit inside the customer's Sprinklr tenant.
      // BuyerWatch only verifies the configured active Reddit account and
      // stores its non-secret account mapping; no Reddit password is handled.
      const account = await fetchSprinklrRedditAccount()
      await saveSprinklrRedditConnection({
        userId: user.id,
        username: account.username,
        accountId: account.accountId,
        channelId: account.channelId,
      })
      return NextResponse.json({
        success: true,
        connection: {
          platform: 'reddit',
          external_username: account.username,
          status: 'active',
          provider: 'sprinklr',
        },
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (provider === 'hyperbrowser') {
      const body = await readJsonBody<Record<string, unknown>>(request, 1_024)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
      if (!sessionId) {
        return NextResponse.json({ error: 'hyperbrowser_sign_in_session_required' }, { status: 409 })
      }
      const session = await getHyperbrowserRedditConnectionForVerification(user.id)
      await finishHyperbrowserRedditSignInSession({
        sessionId,
        profileId: session.profileId,
      })
      const profile = await fetchHyperbrowserRedditAccountProfile({
        username: session.username,
        profileId: session.profileId,
      })
      await saveHyperbrowserRedditConnection({
        userId: user.id,
        username: session.username,
        profileId: session.profileId,
        accountCreatedAt: profile.createdAt,
        linkKarma: profile.linkKarma,
        commentKarma: profile.commentKarma,
      })
      return NextResponse.json({
        success: true,
        connection: {
          platform: 'reddit',
          external_username: session.username,
          status: 'active',
          provider: 'hyperbrowser',
        },
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const body = await readJsonBody<Record<string, unknown>>(request, 4_096)
    const username = normalizeRedditUsername(body.username)
    const password = boundedString(body.password, 512, { required: true, trim: false })
    const totpSecret = normalizeTotpSecret(body.totpSecret)
    if (!username || password === null || totpSecret === null) {
      return NextResponse.json({ error: 'invalid_reddit_credentials_format' }, { status: 400 })
    }

    const providerAccount = await fetchRedditApisAccountStatus()
    if (providerAccount.creditsRemaining < REDDITAPIS_MINIMUM_OPERATIONAL_CREDITS) {
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
    if (error instanceof SprinklrRequestError) {
      return NextResponse.json({ error: error.code }, { status: sprinklrErrorStatus(error) })
    }
    if (error instanceof HyperbrowserRedditError) {
      return NextResponse.json({ error: error.code }, {
        status: error.code === 'hyperbrowser_authentication_failed'
          ? 503
          : error.reauthRequired ? 401 : error.retryable ? 503 : 409,
      })
    }
    if (error instanceof HyperbrowserRedditProvisioningError) {
      return NextResponse.json({ error: error.code }, {
        status: error.retryable ? 503 : 409,
      })
    }
    if (error instanceof RedditConnectionStateError) {
      return NextResponse.json({ error: error.code }, { status: 409 })
    }
    console.error('[settings/reddit] Connection failed')
    return NextResponse.json({ error: 'reddit_connection_failed' }, { status: 500 })
  }
}
