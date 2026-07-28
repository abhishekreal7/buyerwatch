import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { actionRateLimit, getIp } from '@/lib/ratelimit'

async function allRows(
  client: Awaited<ReturnType<typeof createClient>>,
  table: string,
  userId: string,
) {
  const rows: unknown[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
  }
  return rows
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const rate = await actionRateLimit.limit(`account-export:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, competitors, tone_examples, notification_preferences, plan, created_at')
      .eq('id', user.id)
      .single()
    if (profileError) throw profileError

    const [keywords, threads, analytics, feedback, attribution, usage] = await Promise.all([
      allRows(supabase, 'keywords', user.id),
      allRows(supabase, 'monitored_threads', user.id),
      allRows(supabase, 'reply_analytics', user.id),
      allRows(supabase, 'draft_feedback', user.id),
      allRows(supabase, 'reply_attribution', user.id),
      allRows(supabase, 'usage_logs', user.id),
    ])

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, createdAt: user.created_at },
      profile,
      keywords,
      monitoredThreads: threads,
      replyAnalytics: analytics,
      draftFeedback: feedback,
      attribution,
      usage,
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="buyerwatch-export.json"',
      },
    })
  } catch (error) {
    console.error('[account/export] Export failed', error)
    return NextResponse.json({ error: 'account_export_failed' }, { status: 500 })
  }
}
