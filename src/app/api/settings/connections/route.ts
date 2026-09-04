import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'
import {
  getRedditPostingProviderKind,
  hasRedditDiscoveryProvider,
  hasRedditPostingProvider,
} from '@/lib/env'
import { getRedditConnectionSummary } from '@/lib/reddit-session'
import { isXDiscoveryConfigured } from '@/lib/x'
import { isXPostingConfigured } from '@/lib/x-post'
import { evaluateRedditAutoSendEligibility } from '@/lib/reddit-auto-send-eligibility'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('platform_connections')
    .select('platform, external_username')
    .eq('user_id', user.id)
  if (error) {
    return NextResponse.json({ error: 'connections_load_failed' }, { status: 500 })
  }

  const redditSummary = await getRedditConnectionSummary(user.id)
  const connections = (data ?? []).map(connection => connection.platform === 'reddit'
    ? {
        ...connection,
        status: redditSummary.status,
        last_verified_at: redditSummary.lastVerifiedAt,
        last_used_at: redditSummary.lastUsedAt,
        account_created_at: redditSummary.accountCreatedAt,
        link_karma: redditSummary.linkKarma,
        comment_karma: redditSummary.commentKarma,
        auto_send_eligibility: evaluateRedditAutoSendEligibility({
          accountCreatedAt: redditSummary.accountCreatedAt,
          linkKarma: redditSummary.linkKarma,
          commentKarma: redditSummary.commentKarma,
        }),
        provider: redditSummary.provider,
      }
    : { ...connection, status: 'active' })

  return NextResponse.json({
    connections,
    capabilities: {
      blueskyDirectPosting: true,
      redditDirectPosting: hasRedditPostingProvider(),
      redditScheduledDiscovery: hasRedditDiscoveryProvider(),
      redditConnectionProvider: getRedditPostingProviderKind(),
      redditBrowserConnection: true,
      xDiscovery: isXDiscoveryConfigured(),
      xDirectPosting: isXPostingConfigured(),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: Request) {
  try {
    if (!isTrustedSameOriginMutation(request)) {
      return NextResponse.json({ error: 'untrusted_request_origin' }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { platform } = await readJsonBody<Record<string, unknown>>(request, 1_024)
    if (platform !== 'reddit' && platform !== 'bluesky' && platform !== 'x') {
      return NextResponse.json({ error: 'invalid_platform' }, { status: 400 })
    }
    const rate = await settingsRateLimit.limit(`connection-delete:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const admin = getServiceRoleClient()
    if (platform === 'reddit') {
      const { data: redditSecret, error: redditSecretError } = await admin
        .from('reddit_connection_secrets')
        .select('provider')
        .eq('user_id', user.id)
        .maybeSingle()
      if (redditSecretError) throw redditSecretError

      // Managed profiles are durable provider resources. Preserve their
      // encrypted identifier so a deliberate disconnect can be reversed
      // without asking an operator to recreate the connection.
      if (redditSecret?.provider === 'hyperbrowser') {
        const { error } = await admin
          .from('reddit_connection_secrets')
          .update({
            status: 'disconnected',
            consecutive_failures: 0,
            last_error_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
        if (error) throw error
        return NextResponse.json({ success: true })
      }
    }

    const { error } = await admin
      .from('platform_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', platform)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'disconnect_failed' }, { status: 500 })
  }
}
