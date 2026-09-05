import { getServiceRoleClient } from './admin'
import { logger } from './logger'
import { checkGoogleRankQueue, notifySlackQueue } from './queues'

type FollowUpInput = {
  userId: string
  threadId: string
  rank?: { url: string; matchedKeyword?: string }
  slack: {
    postUrl: string
    postTitle?: string
    postAuthor?: string
    intentScore: number
    draftText: string
    subreddit: string
  }
}

export async function persistAndDispatchFollowUps(input: FollowUpInput): Promise<void> {
  const entries = [
    ...(input.rank ? [{
      user_id: input.userId,
      thread_id: input.threadId,
      kind: 'google_rank',
      payload: { threadId: input.threadId, ...input.rank },
    }] : []),
    {
      user_id: input.userId,
      thread_id: input.threadId,
      kind: 'slack',
      payload: { userId: input.userId, ...input.slack },
    },
  ]
  const { error } = await getServiceRoleClient()
    .from('follow_up_outbox')
    .upsert(entries, { onConflict: 'thread_id,kind', ignoreDuplicates: true })
  if (error) {
    logger.error({ code: error.code }, 'Could not persist follow-up intents')
    return
  }
  await dispatchPendingFollowUps(10, input.threadId)
}

export async function dispatchPendingFollowUps(
  limit = 100,
  threadId?: string,
): Promise<number> {
  const admin = getServiceRoleClient()
  let query = admin
    .from('follow_up_outbox')
    .select('id, thread_id, kind, payload, attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)))
  if (threadId) query = query.eq('thread_id', threadId)
  const { data, error } = await query
  if (error) throw error

  let dispatched = 0
  for (const entry of data ?? []) {
    try {
      if (entry.kind === 'google_rank') {
        await checkGoogleRankQueue.add(
          'check-google-rank',
          entry.payload as object,
          { jobId: `rank-${entry.thread_id}` },
        )
      } else {
        await notifySlackQueue.add(
          'notify-slack',
          entry.payload as object,
          { jobId: `slack-${entry.thread_id}` },
        )
      }
      const now = new Date().toISOString()
      const { error: updateError } = await admin
        .from('follow_up_outbox')
        .update({
          status: 'dispatched',
          attempts: entry.attempts + 1,
          last_error: null,
          dispatched_at: now,
          updated_at: now,
        })
        .eq('id', entry.id)
        .eq('status', 'pending')
      if (updateError) throw updateError
      dispatched += 1
    } catch (queueError) {
      const code = queueError instanceof Error ? queueError.name : 'unknown'
      await admin
        .from('follow_up_outbox')
        .update({
          attempts: entry.attempts + 1,
          last_error: code,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id)
      logger.warn(
        { code, kind: entry.kind, threadId: entry.thread_id },
        'Follow-up enqueue failed and remains pending',
      )
    }
  }
  return dispatched
}
