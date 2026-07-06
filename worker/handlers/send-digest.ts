import { Job } from 'bullmq'
import { Resend } from 'resend'
import { WeeklyDigest } from '../../src/emails/WeeklyDigest'
import { logger } from '../../src/lib/logger'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function sendDigestHandler(job: Job) {
  const { userId, email, items } = job.data
  
  if (!email) {
    logger.warn({ userId }, 'Digest skipped: no email provided')
    return { success: false, reason: 'no email' }
  }

  if (!items || items.length === 0) {
    logger.info({ userId }, 'Digest skipped: no items to send')
    return { success: true, reason: 'no items' }
  }

  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString()

    const [
      { count: threadsCount },
      { count: draftsCount },
      { count: sentCount }
    ] = await Promise.all([
      supabase.from('monitored_threads').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sevenDaysAgoStr),
      supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sevenDaysAgoStr).not('draft_text', 'is', null),
      supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sevenDaysAgoStr).eq('was_sent', true)
    ])

    const data = await resend.emails.send({
      from: 'Scouto <hello@scouto.com>',
      to: [email],
      subject: `Scouto found ${threadsCount || items.length} opportunities for you this week`,
      react: WeeklyDigest({
        opportunities: items,
        totalFound: threadsCount || items.length,
        totalDrafts: draftsCount || 0,
        totalReplies: sentCount || 0,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
      })
    })

    logger.info({ userId, messageId: data?.data?.id }, 'Digest sent successfully')
    
    return { success: true, messageId: data?.data?.id }
  } catch (error) {
    logger.error({ error, userId }, 'Failed to send digest email')
    throw error
  }
}
