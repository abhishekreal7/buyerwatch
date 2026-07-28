import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { normalizePlan } from '@/lib/plan-limits'
import { createClient } from '@supabase/supabase-js'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { readJsonBody, RequestInputError } from '@/lib/request'

export async function PATCH(req: Request) {
  try {
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
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { auto_send_enabled, auto_send_threshold } =
    await readJsonBody<Record<string, unknown>>(req, 1_024)
  const threshold = typeof auto_send_threshold === 'number'
    ? auto_send_threshold
    : undefined
  if (
    typeof auto_send_enabled !== 'boolean' ||
    (auto_send_threshold !== undefined && (
      threshold === undefined ||
      !Number.isInteger(threshold) ||
      threshold < 70 ||
      threshold > 100
    ))
  ) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const rate = await settingsRateLimit.limit(`autosend:${user.id}:${await getIp()}`)
  if (!rate.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  // Plan gate: auto-send is a Professional/Growth feature.
  // Block Free users from enabling it at the API level — this prevents a direct
  // API call from bypassing the UI-level locked toggle in Settings.
  if (auto_send_enabled === true) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()

    if (normalizePlan(profile?.plan) === 'free') {
      return NextResponse.json(
        { error: 'auto_send_requires_paid_plan' },
        { status: 403 }
      )
    }
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const update: { auto_send_enabled: boolean; auto_send_threshold?: number } = {
    auto_send_enabled,
  }
  if (threshold !== undefined) {
    update.auto_send_threshold = threshold
  }

  const { error } = await admin
    .from('profiles')
    .update(update)
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: 'settings_update_failed' }, { status: 500 })
  return NextResponse.json({ success: true, auto_send_enabled })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'settings_update_failed' }, { status: 500 })
  }
}
