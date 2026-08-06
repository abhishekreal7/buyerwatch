import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { searchBlueskyPosts } from '../../src/lib/bluesky'
import { scorePostQueue } from '../../src/lib/queues'
import {
  buildSocialScoreCandidates,
  type SocialKeywordMapping,
  withProfileCompetitors,
} from '../../src/lib/reddit-candidates'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

export async function blueskyFetchHandler(job: Job) {
  const { target, keywordMappings: preloadedMappings } = job.data as {
    target: string
    keywordMappings?: SocialKeywordMapping[]
  }

  try {
    const posts = await searchBlueskyPosts(target)
    
    if (!posts || posts.length === 0) return

    // Find all users watching this specific bluesky query
    let keywordMappings = preloadedMappings
    if (!keywordMappings) {
      const { data, error } = await supabase
        .from('keywords')
        .select('id, user_id, term, profiles!inner(competitors)')
        .eq('platform', 'bluesky')
        .eq('target', target)
        .eq('is_active', true)
      if (error) {
        throw new Error(`Failed to load Bluesky keyword mappings: ${error.message}`)
      }
      keywordMappings = withProfileCompetitors(data ?? [])
    } else if (keywordMappings.length > 0) {
      const { data, error } = await supabase
        .from('keywords')
        .select('id, user_id, term, profiles!inner(competitors)')
        .eq('platform', 'bluesky')
        .eq('target', target)
        .eq('is_active', true)
        .in('id', keywordMappings.map(({ id }) => id))
      if (error) {
        throw new Error(`Failed to validate Bluesky keyword mappings: ${error.message}`)
      }
      keywordMappings = withProfileCompetitors(data ?? [])
    }

    if (keywordMappings.length === 0) return

    const discovery = buildSocialScoreCandidates(posts, keywordMappings)
    for (const candidate of discovery.candidates) {
      const safeJobId = candidate.post.externalId.replace(/:/g, '_')
      await scorePostQueue.add('score', candidate, {
        jobId: `score-${candidate.userId}-${safeJobId}`,
      })
    }

    logger.info({
      query: target,
      posts: posts.length,
      enqueued: discovery.candidates.length,
      skipped: discovery.skipped,
      users: discovery.users,
    }, `Bluesky query ${target}: ${discovery.candidates.length} enqueued`)
  } catch (error) {
    logger.error({ error }, `Failed to fetch bluesky target: ${target}:`)
    throw error
  }
}
