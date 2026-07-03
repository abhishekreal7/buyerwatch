import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import { searchBlueskyPosts } from '../../src/lib/bluesky'
import { scorePostQueue } from '../../src/lib/queues'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

export async function blueskyFetchHandler(job: Job) {
  const { target } = job.data // e.g. "email marketing tool"

  try {
    const posts = await searchBlueskyPosts(target)
    
    if (!posts || posts.length === 0) return

    // Find all users watching this specific bluesky query
    const { data: keywordMappings, error } = await supabase
      .from('keywords')
      .select('id, user_id, term')
      .eq('platform', 'bluesky')
      .eq('target', target)
      .eq('is_active', true) 

    if (error) {
      console.error('Supabase error fetching bluesky keywords:', error)
      return
    }

    if (!keywordMappings || keywordMappings.length === 0) return

    for (const post of posts) {
      const postText = `${post.text || ''}`.toLowerCase()

      for (const mapping of keywordMappings) {
        if (postText.includes(mapping.term.toLowerCase())) {
          await scorePostQueue.add('score', {
            userId: mapping.user_id,
            keywordId: mapping.id,
            post,
          }, {
            jobId: `score-${mapping.user_id}-${post.externalId}`
          })
        }
      }
    }
  } catch (error) {
    console.error(`Failed to fetch bluesky target: ${target}:`, error)
    throw error
  }
}
