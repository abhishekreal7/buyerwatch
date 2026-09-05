import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canMonitorPlatform, getPlanLimits } from '@/lib/plan-limits'
import { getEntitledPlan } from '@/lib/billing-entitlements'
import { isXDiscoveryConfigured } from '@/lib/x'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'

export async function POST(req: Request) {
  try {
    if (!isTrustedSameOriginMutation(req)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readJsonBody<Record<string, unknown>>(req)
    const term = typeof body.term === 'string' ? body.term.trim() : ''
    const platform = typeof body.platform === 'string' ? body.platform : 'reddit'
    let target = typeof body.target === 'string' ? body.target.trim() : ''

    if (!term || !target || term.length > 200 || target.length > 200) {
      return NextResponse.json({ error: 'Missing term or target' }, { status: 400 })
    }

    // Auto-strip "r/" prefix for Reddit targets
    if (platform === 'reddit' && target.toLowerCase().startsWith('r/')) {
      target = target.substring(2)
    }
    if (platform === 'reddit') target = target.toLowerCase()
    if (platform === 'bluesky') target = target.replace(/\s+/g, ' ')

    if (!['reddit', 'bluesky', 'x'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }
    const rate = await actionRateLimit.limit(`keyword-add:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // Fetch plan
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, billing_status, billing_subscription_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
    }

    const plan = getEntitledPlan(profile)
    const limits = getPlanLimits(plan)
    if (!canMonitorPlatform(plan, platform)) {
      return NextResponse.json(
        { error: 'plan_feature_unavailable', feature: 'platform', platform },
        { status: 403 },
      )
    }
    if (platform === 'x' && !isXDiscoveryConfigured()) {
      // A paid user must receive an actionable failure instead of a rule that
      // looks active but can never be polled while the provider is disabled.
      return NextResponse.json(
        { error: 'platform_temporarily_unavailable', platform: 'x' },
        { status: 503 },
      )
    }

    // Count existing keywords
    const { count, error: countError } = await supabase
      .from('keywords')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (countError) {
      return NextResponse.json({ error: 'Failed to count keywords' }, { status: 500 })
    }

    if ((count ?? 0) >= limits.keywords) {
      return NextResponse.json(
        { error: 'plan_limit_reached', limit: 'keywords' },
        { status: 403 }
      )
    }

    const { data: targets, error: targetsError } = await supabase
      .from('keywords')
      .select('platform, target')
      .eq('user_id', user.id)
      .eq('is_active', true)
    if (targetsError) {
      return NextResponse.json({ error: 'Failed to count monitored communities' }, { status: 500 })
    }
    const targetKey = `${platform}\u0000${target.toLowerCase()}`
    const uniqueTargets = new Set((targets ?? []).map(item =>
      `${item.platform}\u0000${String(item.target).toLowerCase()}`,
    ))
    if (!uniqueTargets.has(targetKey) && uniqueTargets.size >= limits.monitoredTargets) {
      return NextResponse.json(
        { error: 'plan_limit_reached', limit: 'monitored_communities' },
        { status: 403 },
      )
    }

    const { data, error } = await supabase
      .from('keywords')
      .insert({
        user_id: user.id,
        term,
        platform,
        target,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      // Trigger raises P0001 for plan limits; RLS may surface as 42501/policy.
      const message = error.message?.toLowerCase() ?? ''
      if (
        error.code === 'P0001'
        || error.code === '42501'
        || message.includes('keyword plan limit')
        || message.includes('monitored community plan limit')
        || message.includes('policy')
      ) {
        return NextResponse.json(
          { error: 'plan_limit_reached', limit: 'keywords' },
          { status: 403 }
        )
      }
      return NextResponse.json({ error: 'keyword_save_failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, keyword: data })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
