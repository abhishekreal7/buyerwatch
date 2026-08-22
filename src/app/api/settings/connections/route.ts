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
    if (platform !== 'reddit' && platform !== 'bluesky') {
      return NextResponse.json({ error: 'invalid_platform' }, { status: 400 })
    }
    const rate = await settingsRateLimit.limit(`connection-delete:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const { error } = await getServiceRoleClient()
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
