import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { createMcpAccessToken } from '@/lib/mcp-auth'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation } from '@/lib/request'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await getServiceRoleClient()
    .from('mcp_access_tokens')
    .select('token_prefix, created_at, last_used_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'mcp_settings_load_failed' }, { status: 500 })

  return NextResponse.json({
    configured: Boolean(data),
    tokenPrefix: data?.token_prefix ?? null,
    createdAt: data?.created_at ?? null,
    lastUsedAt: data?.last_used_at ?? null,
    endpoint: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.buyerwatch.co'}/api/mcp`,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  if (!isTrustedSameOriginMutation(request)) {
    return NextResponse.json({ error: 'untrusted_request_origin' }, { status: 403 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rate = await settingsRateLimit.limit(`mcp-token-create:${user.id}:${await getIp()}`)
  if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const admin = getServiceRoleClient()
  const credentials = createMcpAccessToken()
  const { data, error } = await admin.rpc('rotate_mcp_access_token_v1', {
    p_user_id: user.id,
    p_token_hash: credentials.hash,
    p_token_prefix: credentials.prefix,
  })
  if (error || !data) return NextResponse.json({ error: 'mcp_token_create_failed' }, { status: 500 })

  return NextResponse.json({
    token: credentials.token,
    tokenPrefix: credentials.prefix,
    endpoint: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.buyerwatch.co'}/api/mcp`,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: Request) {
  if (!isTrustedSameOriginMutation(request)) {
    return NextResponse.json({ error: 'untrusted_request_origin' }, { status: 403 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rate = await settingsRateLimit.limit(`mcp-token-revoke:${user.id}:${await getIp()}`)
  if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const { error } = await getServiceRoleClient()
    .from('mcp_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('revoked_at', null)
  if (error) return NextResponse.json({ error: 'mcp_token_revoke_failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
