import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendDigestQueue } from '@/lib/queues'
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({
      success: true,
      configured: false,
      digestsQueued: 0,
    })
  }

  try {
    const supabase = getSupabaseAdmin()
    const pageSize = 1_000
    const profiles: Array<{ id: string; notification_preferences: Record<string, boolean> | null }> = []
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, notification_preferences')
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      profiles.push(...(data ?? []))
      if ((data?.length ?? 0) < pageSize) break
    }

    const opportunities: any[] = []
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .rpc('get_digest_opportunities', {
          p_since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
          p_min_score: 70,
          p_per_user: 10,
        })
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      opportunities.push(...(data ?? []))
      if ((data?.length ?? 0) < pageSize) break
    }

    const eligibleProfiles = new Map(
      (profiles ?? [])
        .filter((profile) => {
          const preferences = profile.notification_preferences ?? {}
          return preferences.weeklyReport || preferences.emailDigest
        })
        .map((profile) => [profile.id, profile]),
    )

    const emailsByUser = new Map<string, string>()
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: pageSize })
      if (error) throw error
      for (const user of data.users) {
        if (user.email && eligibleProfiles.has(user.id)) emailsByUser.set(user.id, user.email)
      }
      if (data.users.length < pageSize) break
    }

    const opportunitiesByUser = new Map<string, typeof opportunities>()
    for (const opportunity of opportunities ?? []) {
      const existing = opportunitiesByUser.get(opportunity.user_id) ?? []
      existing.push(opportunity)
      opportunitiesByUser.set(opportunity.user_id, existing)
    }

    let digestsQueued = 0
    const week = new Date().toISOString().slice(0, 10)
    for (const [userId, items] of opportunitiesByUser) {
      const email = emailsByUser.get(userId)
      if (!email || !items?.length) continue
      await sendDigestQueue.add(
        'digest',
        { userId, email, items },
        { jobId: `digest-${userId}-${week}` },
      )
      digestsQueued += 1
    }

    return NextResponse.json({ success: true, digestsQueued })
  } catch (error) {
    logger.error({ error }, 'Send digest cron failed')
    return NextResponse.json({ error: 'digest_enqueue_failed' }, { status: 500 })
  }
}
