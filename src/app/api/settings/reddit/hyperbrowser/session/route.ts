import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getRedditPostingProviderKind } from '@/lib/env'
import { authRateLimit, getIp } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'
import { normalizeRedditUsername } from '@/lib/redditapis-contract'
import {
  getHyperbrowserRedditConnectionForVerification,
  RedditConnectionStateError,
  savePendingHyperbrowserRedditConnection,
} from '@/lib/reddit-session'
import {
  createHyperbrowserRedditProfile,
  createHyperbrowserRedditSignInSession,
  deleteHyperbrowserRedditProfile,
  HyperbrowserRedditProvisioningError,
} from '@/lib/hyperbrowser-reddit-provisioning'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let createdProfileId: string | null = null
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
    const rate = await authRateLimit.limit(`reddit-hyperbrowser-session:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const body = await readJsonBody<Record<string, unknown>>(request, 1_024)
    const username = normalizeRedditUsername(body.username)
    if (!username) return NextResponse.json({ error: 'reddit_username_invalid' }, { status: 400 })

    const existing = await getHyperbrowserRedditConnectionForVerification(user.id).catch(error => {
      if (error instanceof RedditConnectionStateError
        && error.code === 'hyperbrowser_profile_connection_required') return null
      throw error
    })
    const profileId = existing?.username.toLowerCase() === username.toLowerCase()
      ? existing.profileId
      : await createHyperbrowserRedditProfile(user.id)
    if (!existing || existing.profileId !== profileId) createdProfileId = profileId

    await savePendingHyperbrowserRedditConnection({ userId: user.id, username, profileId })
    if (existing && existing.profileId !== profileId) {
      await deleteHyperbrowserRedditProfile(existing.profileId)
    }
    // Once the pending row exists, keep the profile even if session creation
    // transiently fails so a retry reuses the same durable resource.
    createdProfileId = null
    const session = await createHyperbrowserRedditSignInSession(profileId)

    return NextResponse.json({ success: true, ...session }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (createdProfileId) await deleteHyperbrowserRedditProfile(createdProfileId)
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof HyperbrowserRedditProvisioningError) {
      console.warn('[settings/reddit/hyperbrowser/session] Provisioning rejected', {
        errorCode: error.code,
        retryable: error.retryable,
      })
      return NextResponse.json({ error: error.code }, {
        status: error.retryable ? 503 : error.code === 'hyperbrowser_credits_exhausted' ? 503 : 409,
      })
    }
    if (error instanceof RedditConnectionStateError) {
      return NextResponse.json({ error: error.code }, { status: 409 })
    }
    const errorCode = error instanceof Error ? error.message : 'unknown'
    console.error('[settings/reddit/hyperbrowser/session] Provisioning failed', { errorCode })
    return NextResponse.json({ error: 'hyperbrowser_session_unavailable' }, { status: 500 })
  }
}
