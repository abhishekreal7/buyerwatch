import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import { fetchSubredditNew } from '../../src/lib/reddit'
import { scorePostQueue } from '../../src/lib/queues'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function redditFetchHandler(job: Job) {
  const { target } = job.data // e.g. "smallbusiness"

  if (process.env.USE_MOCK_REDDIT === 'true') {
    console.log(`[Mock] Fetching Reddit for target: r/${target}`)
    // Mock processing logic could go here, or we just skip if in real worker flow
    return
  }

  try {
    const posts = await fetchSubredditNew(target)
    
    if (!posts || posts.length === 0) return

    // Find all users watching this specific subreddit
    // Note: in a massive app, you'd cache the mappings of target -> users in Redis
    const { data: keywordMappings, error } = await supabase
      .from('keywords')
      .select('id, user_id, term')
      .eq('platform', 'reddit')
      .eq('target', target)
      .eq('is_active', true) // assuming an active flag exists

    if (error) {
      console.error('Supabase error fetching keywords:', error)
      return
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
    console.error(`Failed to fetch reddit target r/${target}:`, error)
    throw error // BullMQ will retry based on config
  }
}
