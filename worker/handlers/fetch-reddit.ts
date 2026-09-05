import * as dotenv from 'dotenv'
import type { Job } from 'bullmq'
import path from 'path'
import { logger } from '../../src/lib/logger'
import { scorePostQueue } from '../../src/lib/queues'
import {
  buildRedditScoreCandidates,
  type RedditKeywordMapping,
  withProfileCompetitors,
} from '../../src/lib/reddit-candidates'
import { fetchSubredditNewWithSource, fetchSubredditSearchWithSource } from '../../src/lib/reddit'
import type { NormalizedPost } from '../../src/lib/types'
import { getRedditDiscoveryCapacity } from '../../src/lib/reddit-discovery-capacity'
import {
  recordKeywordPollFailure,
  recordKeywordPollSuccess,
} from '../../src/lib/keyword-poll-health'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

export async function redditFetchHandler(job: Job) {
  const { target, keywordMappings: preloadedMappings } = job.data as {
    target: string
    keywordMappings?: RedditKeywordMapping[]
  }

  let keywordMappings = preloadedMappings
  let keywordIds = preloadedMappings?.map(({ id }) => id) ?? []
  let sourceFetchRecorded = false
  try {
    if (!keywordMappings) {
      const { data, error } = await supabase
        .from('keywords')
        .select('id, user_id, term, profiles!inner(competitors, billing_status, billing_subscription_id)')
        .eq('platform', 'reddit')
        .eq('target', target)
        .eq('is_active', true)
        .eq('profiles.billing_status', 'active')
        .not('profiles.billing_subscription_id', 'is', null)

      if (error) {
        throw new Error(`Failed to load Reddit keyword mappings: ${error.message}`)
      }
      keywordMappings = withProfileCompetitors(data ?? [])
    } else if (keywordMappings.length > 0) {
      const ids = keywordMappings.map(({ id }) => id)
      const { data, error } = await supabase
        .from('keywords')
        .select('id, user_id, term, profiles!inner(competitors, billing_status, billing_subscription_id)')
        .in('id', ids)
        .eq('profiles.billing_status', 'active')
        .not('profiles.billing_subscription_id', 'is', null)
      if (error) {
        throw new Error(`Failed to validate Reddit keyword mappings: ${error.message}`)
      }
      keywordMappings = withProfileCompetitors(data ?? [])
    }

    if (keywordMappings.length === 0) return
    keywordIds = keywordMappings.map(({ id }) => id)

    const capacity = await getRedditDiscoveryCapacity()
    const result = await fetchSubredditNewWithSource(target, 25, { mode: capacity.mode })
    const posts = result.posts
    await recordKeywordPollSuccess(
      keywordIds,
      new Date(),
      result.source === 'rss' ? 'reddit_rss' : undefined,
    )
    sourceFetchRecorded = true
    if (!posts || posts.length === 0) {
      logger.info({ subreddit: target }, `r/${target}: source checked; no posts returned`)
      return
    }

    const discovery = buildRedditScoreCandidates(posts, keywordMappings)
    let candidates = discovery.candidates
    if (candidates.length === 0 && keywordMappings.length > 0) {
      const searchTerms = [...new Set(keywordMappings.map(m => m.term.trim()).filter(Boolean))]
      const searchPosts: NormalizedPost[] = []
      for (const term of searchTerms.slice(0, 3)) {
        try {
          const searchResult = await fetchSubredditSearchWithSource(target, term, 25, { mode: capacity.mode })
          searchPosts.push(...searchResult.posts)
        } catch {
          // ignore search failure
        }
      }
      if (searchPosts.length > 0) {
        const searchDiscovery = buildRedditScoreCandidates(searchPosts, keywordMappings)
        candidates = searchDiscovery.candidates
      }
    }
    for (const candidate of candidates) {
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
    if (!sourceFetchRecorded) {
      await recordKeywordPollFailure(keywordIds, error).catch((healthError) => {
        logger.error({ healthError, target }, 'Failed to record Reddit keyword poll failure')
      })
    }
    logger.error({ error }, `Failed to fetch reddit target r/${target}`)
    throw error
  }
}
