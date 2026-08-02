import { Job } from 'bullmq'
import { processSendReply, type SendReplyData } from '../../src/lib/send-reply'

export async function sendReplyHandler(job: Job<SendReplyData>) {
  const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1
  return processSendReply(job.data, {
    attempt: job.attemptsMade + 1,
    maxAttempts: attempts,
    jobId: job.id,
    discard: () => job.discard(),
  })
}
