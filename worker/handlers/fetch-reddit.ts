import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import { fetchSubredditNew } from '../../src/lib/reddit'
import { scorePostQueue } from '../../src/lib/queues'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

export async function redditFetchHandler(job: Job) {
  // keywordMappings is optionally pre-supplied by the fetch-now route so that
  // results are correctly linked to the triggering user without a second DB lookup.
  const { target, keywordMappings: preloadedMappings } = job.data // e.g. "smallbusiness"

  if (process.env.REDDIT_API_APPROVED !== 'true') {
    logger.info({ job: job.id, subreddit: job.data.target }, 'Reddit fetch running in mock mode — pending API approval')
  }

  try {
    const posts = await fetchSubredditNew(target)
    
    if (!posts || posts.length === 0) return

    // If keywordMappings was pre-supplied (fetch-now path), use it directly.
    // Otherwise fall back to DB lookup (standard cron path).
    let keywordMappings = preloadedMappings
    if (!keywordMappings) {
      // Find all users watching this specific subreddit
      // Note: in a massive app, you'd cache the mappings of target -> users in Redis
      const { data, error } = await supabase
        .from('keywords')
        .select('id, user_id, term')
        .eq('platform', 'reddit')
        .eq('target', target)
        .eq('is_active', true)

      if (error) {
        logger.error({ error }, 'Supabase error fetching keywords:')
        return
      }
      keywordMappings = data
    } else {
      // When mappings are pre-supplied, fetch the keyword terms for text matching
      if (keywordMappings.length > 0) {
        const ids = keywordMappings.map((m: any) => m.id)
        const { data: kwData } = await supabase
          .from('keywords')
          .select('id, user_id, term')
          .in('id', ids)
        if (kwData) keywordMappings = kwData
      }
    }

    if (!keywordMappings || keywordMappings.length === 0) return

    // For every post, check against the terms of users watching this subreddit
    for (const post of posts) {
      // Very basic text search (case insensitive) for matching
      const postText = `${post.text || ''}`.toLowerCase()

      for (const mapping of keywordMappings) {
        if (postText.includes(mapping.term.toLowerCase())) {
          // Push to score queue
          await scorePostQueue.add('score', {
            userId: mapping.user_id,
            keywordId: mapping.id,
            post,
          }, {
            // Deduplicate: same user shouldn't score same post twice
            jobId: `score-${mapping.user_id}-${post.externalId}`
          })
        }
      }
    }
  } catch (error) {
    logger.error({ error }, `Failed to fetch reddit target r/${target}:`)
    throw error // BullMQ will retry based on config
  }
}

