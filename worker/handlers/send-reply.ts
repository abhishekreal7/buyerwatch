import { Job } from 'bullmq'
import { logger } from '../../src/lib/logger'
import { createClient } from '@supabase/supabase-js'
import { postRedditReply, PlatformPostError } from '../../src/lib/reddit-post'
import { postBlueskyReply } from '../../src/lib/bluesky-post'
import { checkSendRateLimit } from '../../src/lib/send-limiter'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface SendReplyData {
  userId: string
  threadExternalId: string
  threadId: string
  text: string
  platform: 'reddit' | 'bluesky' | 'x' | 'threads'
  triggerType: 'manual' | 'auto'
}

export async function sendReplyHandler(job: Job<SendReplyData>) {
  const { userId, threadExternalId, threadId, text, platform, triggerType } = job.data

  logger.info({ jobId: job.id, platform, userId, triggerType }, 'Processing send reply job')

  try {
    // 1. Enforce rate limits
    const rateLimitCheck = await checkSendRateLimit(userId, platform as 'reddit' | 'bluesky')
    if (!rateLimitCheck.allowed) {
      const { sendReplyQueue } = await import('../../src/lib/queues/index.js')
      const delayMs = rateLimitCheck.reset ? Math.max(rateLimitCheck.reset - Date.now(), 10000) : 60000
      
      logger.info({ jobId: job.id, platform, delayMs }, 'Rate limit exceeded, re-queuing with delay')
      await sendReplyQueue.add(job.name, job.data, { delay: delayMs })
      return // Gracefully exit without failing, as we have re-queued it
    }

    // 2. Dispatch to platform
    let permalink: string | null = null
    if (platform === 'reddit') {
      const result = await postRedditReply(userId, threadExternalId, text)
      permalink = result.permalink
    } else if (platform === 'bluesky') {
      const result = await postBlueskyReply(userId, threadExternalId, text)
      permalink = result.permalink
    } else {
      throw new Error(`Platform ${platform} sending not implemented yet`)
    }

    // 3. Success state
    await supabase.from('monitored_threads')
      .update({ status: 'replied' })
      .eq('id', threadId)
      
    await supabase.from('reply_analytics')
      .update({ was_sent: true, sent_at: new Date().toISOString() })
      .eq('thread_id', threadId)

    await supabase.from('send_audit_log').insert({
      user_id: userId,
      thread_id: threadId,
      platform,
      trigger_type: triggerType,
      status: 'success',
      permalink
    })

    logger.info({ jobId: job.id, permalink }, 'Successfully sent reply')

  } catch (error: any) {
    const isRetryable = error instanceof PlatformPostError ? error.retryable : false
    const status = isRetryable ? 'failed_retryable' : 'failed_permanent'
    const errorMessage = error.message || error.toString()

    logger.error({ err: error, jobId: job.id, platform, isRetryable }, 'Failed to send reply')

    // Only log permanent failures in audit log, or final attempt?
    // Let's log it if it's the last attempt or permanent
    if (!isRetryable || job.attemptsMade === job.opts.attempts) {
      await supabase.from('send_audit_log').insert({
        user_id: userId,
        thread_id: threadId,
        platform,
        trigger_type: triggerType,
        status,
        error_message: errorMessage
      })
    }

    throw error // Re-throw for BullMQ to handle retry
  }
}
