import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPlanLimits } from '@/lib/plan-limits'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'
import { isRedditDirectPostingConfigured } from '@/lib/reddit-post'
import { hasActiveRedditConnection } from '@/lib/reddit-session'

export async function PATCH(req: Request) {
  try {
    if (!isTrustedSameOriginMutation(req)) {
      return NextResponse.json({ error: 'untrusted_request_origin' }, { status: 403 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await readJsonBody<Record<string, unknown>>(req, 4_096)
    const enabled = body.auto_send_enabled
    const threshold = typeof body.auto_send_threshold === 'number'
      ? body.auto_send_threshold
      : undefined
    const dailyLimit = typeof body.auto_send_daily_limit === 'number'
      ? body.auto_send_daily_limit
      : undefined
    const platforms = Array.isArray(body.auto_send_platforms)
      ? body.auto_send_platforms.filter((value): value is string => typeof value === 'string')
      : undefined
    const communities = Array.isArray(body.auto_send_communities)
      ? body.auto_send_communities
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean)
      : undefined

    if (
      typeof enabled !== 'boolean'
      || (body.auto_send_threshold !== undefined && (
        threshold === undefined
        || !Number.isInteger(threshold)
        || threshold < 70
        || threshold > 100
      ))
      || (body.auto_send_daily_limit !== undefined && (
        dailyLimit === undefined
        || !Number.isInteger(dailyLimit)
        || dailyLimit < 1
        || dailyLimit > 25
      ))
      || (platforms !== undefined && (
        platforms.length > 2
        || new Set(platforms).size !== platforms.length
        || platforms.some(platform => !['reddit', 'bluesky'].includes(platform))
      ))
      || (communities !== undefined && (
        communities.length > 50
        || communities.some(value => value.length > 200)
      ))
    ) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const rate = await settingsRateLimit.limit(`autosend:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, auto_send_enabled, auto_send_platforms')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'profile_not_found' }, { status: 404 })

    const isActivating = enabled && profile.auto_send_enabled !== true
    if (enabled && !getPlanLimits(profile.plan).autoSend) {
      return NextResponse.json({ error: 'auto_send_requires_paid_plan' }, { status: 403 })
    }
    if (isActivating) {
      const { data: trust } = await supabase
        .from('user_trust_metrics')
        .select('total_drafts_reviewed')
        .eq('user_id', user.id)
        .maybeSingle()
      const reviewed = Number(trust?.total_drafts_reviewed) || 0
      if (reviewed < 10) {
        return NextResponse.json(
          { error: 'auto_send_trust_gate_incomplete', reviewed, required: 10 },
          { status: 409 },
        )
      }
      if (body.activation_acknowledged !== true) {
        return NextResponse.json(
          { error: 'auto_send_activation_acknowledgement_required' },
          { status: 400 },
        )
      }
    }

    if (enabled) {
      const effectivePlatforms = platforms ?? (
        Array.isArray(profile.auto_send_platforms) ? profile.auto_send_platforms : []
      )
      if (effectivePlatforms.length === 0) {
        return NextResponse.json({ error: 'auto_send_platform_required' }, { status: 409 })
      }

      const { data: connectionRows, error: connectionError } = await supabase
        .from('platform_connections')
        .select('platform')
        .eq('user_id', user.id)
        .in('platform', effectivePlatforms)
      if (connectionError) {
        return NextResponse.json({ error: 'platform_connection_check_failed' }, { status: 500 })
      }

      const connected = new Set((connectionRows ?? []).map(row => row.platform))
      const redditConnectionActive = effectivePlatforms.includes('reddit')
        ? await hasActiveRedditConnection(user.id)
        : false
      const unavailable = effectivePlatforms.filter(platform => (
        !connected.has(platform)
        || (platform === 'reddit' && !redditConnectionActive)
        || (platform === 'reddit' && !isRedditDirectPostingConfigured())
      ))
      if (unavailable.length > 0) {
        return NextResponse.json({
          error: 'auto_send_platform_unavailable',
          platforms: unavailable,
        }, { status: 409 })
      }
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const update: Record<string, unknown> = { auto_send_enabled: enabled }
    if (threshold !== undefined) update.auto_send_threshold = threshold
    if (dailyLimit !== undefined) update.auto_send_daily_limit = dailyLimit
    if (platforms !== undefined) update.auto_send_platforms = platforms
    if (communities !== undefined) update.auto_send_communities = communities
    if (isActivating) update.auto_send_activated_at = new Date().toISOString()

    const { error } = await admin.from('profiles').update(update).eq('id', user.id)
    if (error) return NextResponse.json({ error: 'settings_update_failed' }, { status: 500 })

    return NextResponse.json({
      success: true,
      auto_send_enabled: enabled,
      auto_send_threshold: threshold,
      auto_send_daily_limit: dailyLimit,
      auto_send_platforms: platforms,
      auto_send_communities: communities,
    })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'settings_update_failed' }, { status: 500 })
  }
}
