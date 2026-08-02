import * as dotenv from 'dotenv'
import type { Job } from 'bullmq'
import path from 'path'
import { logger } from '../../src/lib/logger'
import { scorePostQueue } from '../../src/lib/queues'
import {
  buildRedditScoreCandidates,
  type RedditKeywordMapping,
} from '../../src/lib/reddit-candidates'
import { fetchSubredditNew } from '../../src/lib/reddit'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

export async function redditFetchHandler(job: Job) {
  const { target, keywordMappings: preloadedMappings } = job.data as {
    target: string
    keywordMappings?: RedditKeywordMapping[]
  }

  if (process.env.REDDIT_API_APPROVED !== 'true') {
    logger.info(
      { job: job.id, subreddit: target },
      'Reddit fetch using public-feed fallbacks; OAuth API approval pending',
    )
  }

  try {
    const posts = await fetchSubredditNew(target)
    if (!posts || posts.length === 0) return

    let keywordMappings = preloadedMappings
    if (!keywordMappings) {
      const { data, error } = await supabase
        .from('keywords')
        .select('id, user_id, term')
        .eq('platform', 'reddit')
        .eq('target', target)
        .eq('is_active', true)

      if (error) {
        throw new Error(`Failed to load Reddit keyword mappings: ${error.message}`)
      }
      keywordMappings = data ?? []
    } else if (keywordMappings.length > 0) {
      const ids = keywordMappings.map(({ id }) => id)
      const { data, error } = await supabase
        .from('keywords')
        .select('id, user_id, term')
        .in('id', ids)
      if (error) {
        throw new Error(`Failed to validate Reddit keyword mappings: ${error.message}`)
      }
      keywordMappings = data ?? []
    }

    if (keywordMappings.length === 0) return

    const discovery = buildRedditScoreCandidates(posts, keywordMappings)
    for (const candidate of discovery.candidates) {
      await scorePostQueue.add('score', candidate, {
        jobId: `score-${candidate.userId}-${candidate.post.externalId}`,
      })
    }

    logger.info(
      {
        subreddit: target,
        posts: posts.length,
        enqueued: discovery.candidates.length,
        skipped: discovery.skipped,
        users: discovery.users,
      },
      `r/${target}: ${discovery.candidates.length} enqueued, ${discovery.skipped} skipped`,
    )
  } catch (error) {
    logger.error({ error }, `Failed to fetch reddit target r/${target}`)
    throw error
  }
}
