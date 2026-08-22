import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { BUYERWATCH_CONNECTOR_ID } from '@/lib/browser-connector-client'
import { authRateLimit, getIp } from '@/lib/ratelimit'
import {
  isTrustedSameOriginMutation,
  readJsonBody,
  RequestInputError,
} from '@/lib/request'
import { normalizeRedditUsername } from '@/lib/redditapis-contract'
import { saveBrowserRelayRedditConnection } from '@/lib/reddit-session'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    if (!isTrustedSameOriginMutation(request)) {
      return NextResponse.json({ error: 'untrusted_request_origin' }, { status: 403 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rate = await authRateLimit.limit(`reddit-browser-connect:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const body = await readJsonBody<Record<string, unknown>>(request, 1_024)
    const username = normalizeRedditUsername(body.username)
    if (!username) {
      return NextResponse.json({ error: 'reddit_browser_identity_invalid' }, { status: 400 })
    }
    await saveBrowserRelayRedditConnection({
      userId: user.id,
      username,
      connectorId: BUYERWATCH_CONNECTOR_ID,
    })
    return NextResponse.json({
      success: true,
      connection: {
        platform: 'reddit',
        external_username: username,
        status: 'active',
        provider: 'browser_relay',
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[settings/reddit/browser] Connection failed')
    return NextResponse.json({ error: 'reddit_browser_connection_failed' }, { status: 500 })
  }
}
