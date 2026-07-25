import { Job } from 'bullmq'
import { logger } from '../../src/lib/logger'
import { postRedditReply, PlatformPostError } from '../../src/lib/reddit-post'
import { postBlueskyReply } from '../../src/lib/bluesky-post'
import {
  recordSuccessfulSend,
  releaseSendSlot,
  reserveSendSlot,
} from '../../src/lib/send-limiter'
import { ensureAttributionMapping } from '../../src/lib/attribution-store'
import { supabaseWorker as supabase } from '../lib/supabase'

interface SendReplyData {
  userId: string
  threadExternalId: string
  threadId: string
  text: string
  platform: 'reddit' | 'bluesky'
  triggerType: 'manual' | 'auto'
}

async function requireNoError(
  operation: PromiseLike<{ error: { message: string } | null }>,
  context: string,
) {
  const { error } = await operation
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function sendReplyHandler(job: Job<SendReplyData>) {
  const { userId, threadExternalId, threadId, text, platform, triggerType } = job.data

  const reservation = await reserveSendSlot(userId, platform)
  if ('reason' in reservation) {
    throw new PlatformPostError(
      platform,
      `Rate limited until ${new Date(reservation.reset).toISOString()}: ${reservation.reason}`,
      true,
    )
  }

  const { data: claimed, error: claimError } = await supabase.rpc('claim_thread_for_send', {
    p_thread_id: threadId,
    p_user_id: userId,
  })
  if (claimError) {
    await releaseSendSlot(userId, platform, reservation.token).catch(() => undefined)
    throw new Error(`Unable to claim reply: ${claimError.message}`)
  }
  if (!claimed) {
    await releaseSendSlot(userId, platform, reservation.token).catch(() => undefined)
    logger.info({ jobId: job.id, threadId }, 'Reply already sent or no longer sendable')
    return { duplicate: true }
  }

  let externalSendSucceeded = false
  let externalPermalink: string | null = null

  try {
    // Persist the redirect mapping before publishing a reply that may contain
    // the shortlink. If this fails, nothing is posted publicly.
    const { data: threadRow, error: threadError } = await supabase
      .from('monitored_threads')
      .select('tracking_sid')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single()
    if (threadError) throw new Error(`Unable to load tracking state: ${threadError.message}`)

    if (threadRow.tracking_sid) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('business_url')
        .eq('id', userId)
        .single()
      if (profileError) throw new Error(`Unable to load attribution destination: ${profileError.message}`)
      if (!profile.business_url) throw new Error('Attribution is enabled but no business URL is configured')

      await ensureAttributionMapping(supabase, {
        userId,
        threadId,
        token: threadRow.tracking_sid,
        businessUrl: profile.business_url,
      })
    }

    const result = platform === 'reddit'
      ? await postRedditReply(userId, threadExternalId, text)
      : await postBlueskyReply(userId, threadExternalId, text)
    externalSendSucceeded = true
    externalPermalink = result.permalink

    await recordSuccessfulSend(userId, platform, reservation.token)

    await requireNoError(
      supabase.from('monitored_threads').update({ status: 'replied' }).eq('id', threadId).eq('user_id', userId),
      'Unable to mark thread replied',
    )
    await requireNoError(
      supabase.from('reply_analytics').update({
        was_sent: true,
        sent_at: new Date().toISOString(),
      }).eq('thread_id', threadId).eq('user_id', userId),
      'Unable to update reply analytics',
    )
    await requireNoError(
      supabase.from('send_audit_log').insert({
        user_id: userId,
        thread_id: threadId,
        platform,
        trigger_type: triggerType,
        status: 'success',
        permalink: result.permalink,
      }),
      'Unable to write send audit',
    )

    return { success: true, permalink: result.permalink }
  } catch (error) {
    if (externalSendSucceeded) {
      // The provider accepted the reply. Never make it sendable again: doing so
      // could create a duplicate public post if a persistence call failed.
      await recordSuccessfulSend(userId, platform, reservation.token).catch(() => undefined)
      await supabase
        .from('monitored_threads')
        .update({ status: 'send_reconciliation_required' })
        .eq('id', threadId)
        .eq('user_id', userId)
      await supabase.from('send_audit_log').insert({
        user_id: userId,
        thread_id: threadId,
        platform,
        trigger_type: triggerType,
        status: 'reconciliation_required',
        permalink: externalPermalink,
        error_message: error instanceof Error ? error.message.slice(0, 500) : 'Post-send persistence error',
      })
      throw error
    }

    await releaseSendSlot(userId, platform, reservation.token).catch(() => undefined)
    const isRetryable = error instanceof PlatformPostError && error.retryable
    const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1
    const finalAttempt = !isRetryable || job.attemptsMade + 1 >= attempts

    // Release the DB claim before BullMQ retries. A concurrently delivered
    // duplicate still cannot claim while this attempt owns `sending`.
    await requireNoError(
      supabase
        .from('monitored_threads')
        .update({ status: 'drafted' })
        .eq('id', threadId)
        .eq('user_id', userId)
        .eq('status', 'sending'),
      'Unable to release failed send claim',
    )

    if (finalAttempt) {
      await supabase.from('send_audit_log').insert({
        user_id: userId,
        thread_id: threadId,
        platform,
        trigger_type: triggerType,
        status: isRetryable ? 'failed_retryable' : 'failed_permanent',
        error_message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown send error',
      })
    }

    throw error
  }
}
