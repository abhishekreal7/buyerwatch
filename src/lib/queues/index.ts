import { Queue } from 'bullmq'
import { redis } from '../redis'

export const redditFetchQueue = new Queue('fetch-reddit', { connection: redis as any })
export const blueskyFetchQueue = new Queue('fetch-bluesky', { connection: redis as any })

// score-post queue uses the same redis connection
export const scorePostQueue = new Queue('score-post', { connection: redis as any })
