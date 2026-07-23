import { Queue } from 'bullmq'
import { redis } from '../redis'

export const redditFetchQueue = new Queue('fetch-reddit', { connection: redis as any })
export const blueskyFetchQueue = new Queue('fetch-bluesky', { connection: redis as any })
export const xFetchQueue = new Queue('fetch-x', { connection: redis as any })

// score-post queue uses the same redis connection
export const scorePostQueue = new Queue('score-post', { connection: redis as any })

// Queue for reliable email delivery via Resend
export const sendDigestQueue = new Queue('send-digest', { 
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    }
  }
})

// Queue for automated or manual reply posting
export const sendReplyQueue = new Queue('send-reply', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: true,
    removeOnFail: 100
  }
})

// Queue for Slack webhook push notifications
export const notifySlackQueue = new Queue('notify-slack', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: true,
    removeOnFail: 50,
  }
})
