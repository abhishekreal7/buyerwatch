import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getPlanLimits, normalizePlan } from '@/lib/plan-limits'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { readJsonBody, RequestInputError } from '@/lib/request'

export async function POST(req: Request) {
  try {
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

    const allowedPlatforms = [
      'reddit',
      'bluesky',
      ...(process.env.ENABLE_X_DISCOVERY === 'true' ? ['x'] : []),
      ...(process.env.ENABLE_THREADS_DISCOVERY === 'true' ? ['threads'] : []),
    ]
    if (!allowedPlatforms.includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }
    const rate = await actionRateLimit.limit(`keyword-add:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // Fetch plan
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
    }

    const plan = normalizePlan(profile?.plan)
    const limits = getPlanLimits(plan)

    // Count existing keywords
    const { count, error: countError } = await supabase
      .from('keywords')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (countError) {
      return NextResponse.json({ error: 'Failed to count keywords' }, { status: 500 })
    }

    if ((count ?? 0) >= limits.keywords) {
      return NextResponse.json(
        { error: 'plan_limit_reached', limit: 'keywords' },
        { status: 403 }
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
      // RLS plan limit rejection surfaces as a policy violation
      if (error.code === '42501' || error.message?.toLowerCase().includes('policy')) {
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
