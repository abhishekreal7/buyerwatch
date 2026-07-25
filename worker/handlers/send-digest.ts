import { Job } from 'bullmq'
import { Resend } from 'resend'
import { WeeklyDigest } from '../../src/emails/WeeklyDigest'
import { logger } from '../../src/lib/logger'
import { createClient } from '@supabase/supabase-js'
import { withTimeout } from '../../src/lib/http'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function sendDigestHandler(job: Job) {
  const { userId, email, items } = job.data

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    logger.info('Digest skipped: email provider is not configured')
    return { success: true, reason: 'email disabled' }
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  
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

    const data = await withTimeout(resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: [email],
      subject: `Scouto found ${threadsCount || items.length} opportunities for you this week`,
      react: WeeklyDigest({
        opportunities: items,
        totalFound: threadsCount || items.length,
        totalDrafts: draftsCount || 0,
        totalReplies: sentCount || 0,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
      })
    }), 15_000, 'digest email delivery')

    logger.info({ userId, messageId: data?.data?.id }, 'Digest sent successfully')
    
    return { success: true, messageId: data?.data?.id }
  } catch (error) {
    logger.error({ error, userId }, 'Failed to send digest email')
    throw error
  }
}
