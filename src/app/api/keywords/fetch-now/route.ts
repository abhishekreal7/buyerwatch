import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { publishMonitoringRun } from '@/lib/qstash'
import { fetchNowRateLimit, getIp } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, isUuid, readJsonBody, RequestInputError } from '@/lib/request'
import { canMonitorPlatform } from '@/lib/plan-limits'
import { getEntitledPlan, hasActiveSubscription } from '@/lib/billing-entitlements'
import { isXDiscoveryConfigured } from '@/lib/x'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    if (!isTrustedSameOriginMutation(req)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readJsonBody<Record<string, unknown>>(req)
    const { keywordId } = body
    if (!isUuid(keywordId)) {
      return NextResponse.json({ error: 'Missing keywordId' }, { status: 400 })
    }

    const rate = await fetchNowRateLimit.limit(
      `fetch-now:${user.id}:${await getIp()}`,
    )
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const { data: keyword, error } = await supabase
      .from('keywords')
      .select('platform, target, profiles!inner(plan, billing_status, billing_subscription_id)')
      .eq('id', keywordId)
      .eq('user_id', user.id)
      .single()
    if (error || !keyword) {
      return NextResponse.json({ error: 'Keyword not found' }, { status: 404 })
    }
    const profile = Array.isArray(keyword.profiles) ? keyword.profiles[0] : keyword.profiles
    const plan = getEntitledPlan(profile)
    if (!hasActiveSubscription(profile)) {
      return NextResponse.json({ error: 'trial_required' }, { status: 403 })
    }
    if (!canMonitorPlatform(plan, keyword.platform)) {
      return NextResponse.json({ error: 'plan_feature_unavailable', feature: 'platform' }, { status: 403 })
    }
    if (keyword.platform === 'x' && !isXDiscoveryConfigured()) {
      return NextResponse.json({ error: 'platform_temporarily_unavailable', platform: 'x' }, { status: 503 })
    }

    const target = keyword.platform === 'reddit'
      ? keyword.target.trim().toLowerCase()
      : keyword.target.trim()
    const messageId = await publishMonitoringRun(user.id, target, keyword.platform)
    if (!messageId) {
      return NextResponse.json(
        { error: 'monitoring_not_configured' },
        { status: 503 },
      )
    }

    return NextResponse.json({
      success: true,
      queued: true,
      platform: keyword.platform,
      target,
      messageId,
    }, { status: 202 })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    logger.error({ error }, 'Error in fetch-now endpoint')
    return NextResponse.json({ error: 'fetch_dispatch_failed' }, { status: 503 })
  }
}
