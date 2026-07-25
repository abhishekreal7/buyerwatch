import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { searchBlueskyPosts } from '../../src/lib/bluesky'
import { scorePostQueue } from '../../src/lib/queues'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

export async function blueskyFetchHandler(job: Job) {
  const { target, keywordMappings: preloadedMappings } = job.data

  try {
    const posts = await searchBlueskyPosts(target)
    
    if (!posts || posts.length === 0) return

    // Find all users watching this specific bluesky query
    let keywordMappings = preloadedMappings
    let error = null
    if (!keywordMappings) {
      const result = await supabase
        .from('keywords')
        .select('id, user_id, term')
        .eq('platform', 'bluesky')
        .eq('target', target)
        .eq('is_active', true)
      keywordMappings = result.data
      error = result.error
    }

    if (error) {
      throw new Error(`Failed to load Bluesky keyword mappings: ${error.message}`)
    }

    if (!keywordMappings || keywordMappings.length === 0) return

    for (const post of posts) {
      const postText = `${post.text || ''}`.toLowerCase()

      for (const mapping of keywordMappings) {
        if (postText.includes(mapping.term.toLowerCase())) {
          const safeJobId = post.externalId.replace(/:/g, '_');
          await scorePostQueue.add('score', {
            userId: mapping.user_id,
            keywordId: mapping.id,
            post,
          }, {
            jobId: `score-${mapping.user_id}-${safeJobId}`
          })
        }
      }
    }
  } catch (error) {
    logger.error({ error }, `Failed to fetch bluesky target: ${target}:`)
    throw error
  }
}
