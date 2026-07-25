import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { fetchSubredditNew } from '../../src/lib/reddit'
import { scorePostQueue } from '../../src/lib/queues'
import { hasBuyingSignal } from '../../src/lib/buying-signal-filter'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

export async function redditFetchHandler(job: Job) {
  const { target, keywordMappings: preloadedMappings } = job.data

  if (process.env.REDDIT_API_APPROVED !== 'true') {
    logger.info({ job: job.id, subreddit: target }, 'Reddit fetch using public-feed fallbacks — OAuth API approval pending')
  }

  try {
    const posts = await fetchSubredditNew(target)
    if (!posts || posts.length === 0) return

    // Resolve keyword mappings (pre-supplied by fetch-now, or queried from DB)
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
      keywordMappings = data
    } else if (keywordMappings.length > 0) {
      const ids = keywordMappings.map((m: any) => m.id)
      const { data: kwData, error: kwError } = await supabase
        .from('keywords')
        .select('id, user_id, term')
        .in('id', ids)
      if (kwError) throw new Error(`Failed to validate Reddit keyword mappings: ${kwError.message}`)
      if (kwData) keywordMappings = kwData
    }

    if (!keywordMappings || keywordMappings.length === 0) return

    // Group keywords by user — one user may have multiple keywords on the same subreddit.
    // We score each post once per user (not once per keyword) to avoid duplicate work.
    // The keyword chosen is whichever of the user's terms appears in the post; if none
    // match textually we still score because the subreddit subscription itself implies intent.
    const userKeywords = new Map<string, { id: string; term: string }[]>()
    for (const m of keywordMappings) {
      if (!userKeywords.has(m.user_id)) userKeywords.set(m.user_id, [])
      userKeywords.get(m.user_id)!.push({ id: m.id, term: m.term })
    }

    let skipped = 0
    let enqueued = 0

    for (const post of posts) {
      const searchable = `${post.title || ''} ${post.text || ''}`.toLowerCase()

      for (const [userId, keywords] of userKeywords) {
        // Determine if this post has explicit keyword match in title+body
        const matched = keywords.find(k => searchable.includes(k.term.toLowerCase()))
        const keywordId = (matched ?? keywords[0]).id

        // Gate: keyword match always passes. No keyword match requires a buying signal.
        // This eliminates ~60-70% of noise before any Gemini call.
        if (!matched && !hasBuyingSignal(searchable)) {
          skipped++
          continue
        }

        // Deduplicate: one score job per user per post, regardless of keyword count
        await scorePostQueue.add('score', {
          userId,
          keywordId,
          post,
        }, {
          jobId: `score-${userId}-${post.externalId}`,
        })
        enqueued++
      }
    }

    logger.info(
      { subreddit: target, posts: posts.length, enqueued, skipped, users: userKeywords.size },
      `r/${target}: ${enqueued} enqueued, ${skipped} skipped (no buying signal)`
    )

  } catch (error) {
    logger.error({ error }, `Failed to fetch reddit target r/${target}:`)
    throw error
  }
}
