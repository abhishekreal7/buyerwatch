import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendDigestQueue } from '../../../../lib/queues'
import { logger } from '../../../../lib/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  
  // Security to ensure only Vercel Cron or admin hits this
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Get all users who have weeklyReport or emailDigest enabled
    // We assume users table or profiles has an email. Wait, profiles doesn't have email. We must join auth.users if needed, or if profile has email.
    // I need to check profiles schema. Let's assume auth.users provides it or we can fetch via supabase admin.
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
    if (usersError) throw usersError

    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('id, notification_preferences')
    
    if (profError) throw profError

    let digestsQueued = 0

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString()

    for (const profile of profiles) {
      const prefs = profile.notification_preferences || {}
      if (!prefs.weeklyReport && !prefs.emailDigest) continue

      const user = users.users.find(u => u.id === profile.id)
      if (!user || !user.email) continue

      const { data: opportunities } = await supabase
        .from('monitored_threads')
        .select('platform, external_id, text_content, url, intent_score')
        .eq('user_id', profile.id)
        .eq('status', 'pending')
        .gte('intent_score', 70)
        .gte('created_at', sevenDaysAgoStr)
        .order('intent_score', { ascending: false })
        .limit(10)

      if (opportunities && opportunities.length > 0) {
        await sendDigestQueue.add(`digest-${profile.id}-${Date.now()}`, {
          userId: profile.id,
          email: user.email,
          items: opportunities
        })
        digestsQueued++
      }
    }

    return NextResponse.json({ success: true, digestsQueued })

  } catch (error: any) {
    logger.error({ error }, 'Send digest cron error')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
