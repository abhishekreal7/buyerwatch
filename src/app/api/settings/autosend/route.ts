import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { canMonitorPlatform, getPlanLimits } from '@/lib/plan-limits'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'
import { isRedditDirectPostingConfigured } from '@/lib/reddit-post'
import { hasActiveRedditConnection } from '@/lib/reddit-session'
import { getRedditDeliveryControl } from '@/lib/reddit-service-safety'
import { isXPostingConfigured } from '@/lib/x-post'
import { getEntitledPlan, hasActiveSubscription } from '@/lib/billing-entitlements'

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
    let threshold = typeof body.auto_send_threshold === 'number'
      ? body.auto_send_threshold
      : undefined
    let dailyLimit = typeof body.auto_send_daily_limit === 'number'
      ? body.auto_send_daily_limit
      : undefined
    const instantAutopilotRequested = body.instant_autopilot === true
    let instantAutopilotActivation = false
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
        platforms.length > 3
        || new Set(platforms).size !== platforms.length
        || platforms.some(platform => !['reddit', 'bluesky', 'x'].includes(platform))
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
      .select('plan, billing_status, billing_subscription_id, auto_send_enabled, auto_send_platforms, instant_autopilot_granted_at, instant_autopilot_expires_at, instant_autopilot_activated_at, instant_autopilot_used_at')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'profile_not_found' }, { status: 404 })

    const entitledPlan = getEntitledPlan(profile)
    const isActivating = enabled && profile.auto_send_enabled !== true
    if (enabled && !getPlanLimits(entitledPlan).autoSend) {
      return NextResponse.json({ error: 'auto_send_requires_paid_plan' }, { status: 403 })
    }
    if (platforms?.some(platform => !canMonitorPlatform(entitledPlan, platform))) {
      return NextResponse.json({ error: 'platform_requires_professional_plan' }, { status: 403 })
    }
    if (isActivating) {
      const { data: trust } = await supabase
        .from('user_trust_metrics')
        .select('total_drafts_reviewed')
        .eq('user_id', user.id)
        .maybeSingle()
      const reviewed = Number(trust?.total_drafts_reviewed) || 0
      const instantAutopilotAvailable = instantAutopilotRequested
        && hasActiveSubscription(profile)
        && Boolean(profile.instant_autopilot_granted_at)
        && Date.parse(profile.instant_autopilot_expires_at ?? '') > Date.now()
        && !profile.instant_autopilot_used_at
      if (reviewed < 10 && !instantAutopilotAvailable) {
        return NextResponse.json(
          { error: 'auto_send_trust_gate_incomplete', reviewed, required: 10 },
          { status: 409 },
        )
      }
      if (instantAutopilotAvailable) {
        instantAutopilotActivation = true
        threshold = Math.max(90, threshold ?? 90)
        dailyLimit = 1
      }
      if (body.activation_acknowledged !== true) {
        return NextResponse.json(
          { error: 'auto_send_activation_acknowledgement_required' },
          { status: 400 },
        )
      }
    }

    let effectivePlatforms: string[] = []
    if (enabled) {
      effectivePlatforms = platforms ?? (
        Array.isArray(profile.auto_send_platforms) ? profile.auto_send_platforms : []
      )

      if (platforms === undefined) {
        const { data: allConns } = await supabase
          .from('platform_connections')
          .select('platform')
          .eq('user_id', user.id)
        const connectedPlatforms = (allConns ?? []).map(c => c.platform)
        const validConnected = effectivePlatforms.filter(p => connectedPlatforms.includes(p))
        if (validConnected.length > 0) {
          effectivePlatforms = validConnected
        } else if (connectedPlatforms.length > 0) {
          effectivePlatforms = connectedPlatforms
        }
      }

      if (effectivePlatforms.length === 0) {
        return NextResponse.json({ error: 'auto_send_platform_required' }, { status: 409 })
      }
      if (effectivePlatforms.includes('reddit')) {
        const control = await getRedditDeliveryControl()
        if (control.state !== 'closed') {
          return NextResponse.json({ error: 'reddit_delivery_paused' }, { status: 409 })
        }
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
        || (platform === 'x' && !isXPostingConfigured())
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
    if (platforms !== undefined || (enabled && effectivePlatforms.length > 0)) {
      update.auto_send_platforms = effectivePlatforms
    }
    if (communities !== undefined) update.auto_send_communities = communities
    if (isActivating) update.auto_send_activated_at = new Date().toISOString()
    if (instantAutopilotActivation) {
      update.instant_autopilot_activated_at = new Date().toISOString()
    }

    const { error } = await admin.from('profiles').update(update).eq('id', user.id)
    if (error) return NextResponse.json({ error: 'settings_update_failed' }, { status: 500 })

    return NextResponse.json({
      success: true,
      auto_send_enabled: enabled,
      auto_send_threshold: threshold,
      auto_send_daily_limit: dailyLimit,
      auto_send_platforms: platforms,
      auto_send_communities: communities,
      instant_autopilot: instantAutopilotActivation,
    })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'settings_update_failed' }, { status: 500 })
  }
}
