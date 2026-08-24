import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  hasCloudflareRssShadowConfiguration,
  isAuthorizedCloudflareRssShadowRequest,
  normalizeRssShadowTarget,
} from '@/lib/cloudflare-rss-shadow'
import { canMonitorPlatform } from '@/lib/plan-limits'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ShadowKeywordRow = {
  target: string
  profiles: { plan?: string | null } | Array<{ plan?: string | null }> | null
}

function shadowTargetLimit(): number {
  const parsed = Number(process.env.CLOUDFLARE_RSS_SHADOW_MAX_TARGETS)
  if (!Number.isSafeInteger(parsed)) return 10
  return Math.max(1, Math.min(100, parsed))
}

function profileFor(row: ShadowKeywordRow) {
  return Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
}

export async function GET(request: Request) {
  if (!hasCloudflareRssShadowConfiguration()) {
    return NextResponse.json({ error: 'shadow_monitor_disabled' }, { status: 503 })
  }
  if (!isAuthorizedCloudflareRssShadowRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data, error } = await supabase
      .from('keywords')
      .select('target, profiles!inner(plan)')
      .eq('platform', 'reddit')
      .eq('is_active', true)
      .order('target', { ascending: true })
      .limit(500)
    if (error) throw error

    const targets = [...new Set(
      ((data ?? []) as ShadowKeywordRow[])
        .filter(row => canMonitorPlatform(profileFor(row)?.plan, 'reddit'))
        .map(row => normalizeRssShadowTarget(row.target))
        .filter((target): target is string => target !== null),
    )].slice(0, shadowTargetLimit())

    return NextResponse.json(
      { targets, maxTargets: shadowTargetLimit() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    logger.error({ error }, 'Unable to load Cloudflare RSS shadow targets')
    return NextResponse.json({ error: 'shadow_targets_unavailable' }, { status: 503 })
  }
}
