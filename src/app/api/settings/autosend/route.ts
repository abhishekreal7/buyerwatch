import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { normalizePlan } from '@/lib/plan-limits'

export async function PATCH(req: Request) {
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

  const { auto_send_enabled } = await req.json()
  if (typeof auto_send_enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
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

  const { error } = await supabase
    .from('profiles')
    .update({ auto_send_enabled })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, auto_send_enabled })
}
