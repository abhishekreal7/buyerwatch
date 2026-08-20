import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { searchBlueskyPosts } from '../../src/lib/bluesky'
import { scorePostQueue } from '../../src/lib/queues'
import {
  recordKeywordPollFailure,
  recordKeywordPollSuccess,
} from '../../src/lib/keyword-poll-health'
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

  // Find all users watching this specific Bluesky query.
  let keywordMappings = preloadedMappings
  let keywordIds = preloadedMappings?.map(({ id }) => id) ?? []
  let sourceFetchRecorded = false
  try {
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
    keywordIds = keywordMappings.map(({ id }) => id)

    const posts = await searchBlueskyPosts(target)
    await recordKeywordPollSuccess(keywordIds)
    sourceFetchRecorded = true
    if (!posts || posts.length === 0) {
      logger.info({ query: target }, 'Bluesky source checked; no posts returned')
      return
    }

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
    if (!sourceFetchRecorded) {
      await recordKeywordPollFailure(keywordIds, error).catch((healthError) => {
        logger.error({ healthError, target }, 'Failed to record Bluesky keyword poll failure')
      })
    }
    logger.error({ error }, `Failed to fetch bluesky target: ${target}:`)
    throw error
  }
}
