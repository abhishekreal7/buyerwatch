import { Job } from 'bullmq'
import { logger } from '../../src/lib/logger'
import { createClient } from '@supabase/supabase-js'
import { postRedditReply, PlatformPostError } from '../../src/lib/reddit-post'
import { postBlueskyReply } from '../../src/lib/bluesky-post'
import { checkSendRateLimit } from '../../src/lib/send-limiter'
import { randomBytes } from 'crypto'

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
      const delayMs = rateLimitCheck.reset ? Math.max(rateLimitCheck.reset - Date.now(), 10000) : 60000
      
      logger.info({ jobId: job.id, platform, delayMs, reason: rateLimitCheck.reason }, 'Rate limit exceeded, will retry after delay')

      // Throw a retriable PlatformPostError so BullMQ handles the retry with backoff
      // and the job appears in the "delayed" or "waiting" state — not "completed".
      // The error handler below treats retriable=true as non-permanent and skips the
      // failure audit log, so there is no false alarm at this stage.
      const retryErr = new PlatformPostError(
        platform,
        `Rate limited: ${rateLimitCheck.reason}`,
        true
      )
      throw retryErr
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

    // Feature 2: Attribution — create a click-tracking row for this reply
    const token = randomBytes(6).toString('base64url') // 8-char URL-safe token
    await supabase.from('reply_attribution').insert({
      user_id: userId,
      thread_id: threadId,
      attribution_token: token,
    }).then(({ error }) => {
      if (error) logger.warn({ error, threadId }, '[Attribution] Failed to create attribution row')
      else logger.debug({ threadId, token }, '[Attribution] Attribution row created')
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
