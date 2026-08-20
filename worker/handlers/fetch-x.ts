import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { fetchXPosts } from '../../src/lib/x'
import { scorePostQueue } from '../../src/lib/queues'
import { X_DAILY_SPEND_LIMIT_CENTS } from '../../src/lib/plan-limits'
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

export async function xFetchHandler(job: Job) {
  const { target, keywordMappings: preloadedMappings } = job.data as {
    target: string
    keywordMappings?: SocialKeywordMapping[]
  }

  let keywordIds = preloadedMappings?.map(({ id }) => id) ?? []
  let sourceFetchRecorded = false
  try {
    // Find all users watching this specific X target
    let keywordMappings = preloadedMappings
    let error = null
    if (!keywordMappings) {
      keywordMappings = []
      const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        const result = await supabase
          .from('keywords')
          .select('id, user_id, term, profiles!inner(competitors)')
          .eq('platform', 'x')
          .eq('target', target)
          .eq('is_active', true)
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (result.error) {
          error = result.error
          break
        }
        keywordMappings.push(...withProfileCompetitors(result.data ?? []))
        if ((result.data?.length ?? 0) < pageSize) break
      }
    }

    if (error) {
      throw new Error(`Failed to load X keyword mappings: ${error.message}`)
    }

    if (!keywordMappings || keywordMappings.length === 0) return
    keywordIds = keywordMappings.map(({ id }) => id)

    // Reserve paid X search capacity before making the provider request. One
    // reservation per customer covers this shared target fetch, not every post.
    const affordableUsers = new Set<string>()
    for (const userId of new Set<string>(
      keywordMappings.map((mapping: { user_id: string }) => mapping.user_id),
    )) {
      if (await checkXSpendBudget(userId)) affordableUsers.add(userId)
    }
    keywordMappings = keywordMappings.filter(
      (mapping: { user_id: string }) => affordableUsers.has(mapping.user_id),
    )
    if (keywordMappings.length === 0) {
      logger.info({ target }, '[Budget] X fetch skipped because no watcher has spend capacity')
      return
    }

    const posts = await fetchXPosts(target)
    await recordKeywordPollSuccess(keywordMappings.map(({ id }) => id))
    sourceFetchRecorded = true
    if (!posts || posts.length === 0) return

    const discovery = buildSocialScoreCandidates(posts, keywordMappings)
    for (const candidate of discovery.candidates) {
      const safeJobId = candidate.post.externalId.replace(/:/g, '_')
      await scorePostQueue.add('score', candidate, {
        jobId: `score-${candidate.userId}-${safeJobId}`,
      })
    }

    logger.info({
      target,
      posts: posts.length,
      enqueued: discovery.candidates.length,
      skipped: discovery.skipped,
      users: discovery.users,
    }, `X target ${target}: ${discovery.candidates.length} enqueued`)
  } catch (error) {
    if (!sourceFetchRecorded) {
      await recordKeywordPollFailure(keywordIds, error).catch((healthError) => {
        logger.error({ healthError, target }, 'Failed to record X keyword poll failure')
      })
    }
    logger.error({ error }, `Failed to fetch X target ${target}:`)
    throw error
  }
}

async function checkXSpendBudget(userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single()

  if (profileError) throw new Error(`Failed to load X budget profile: ${profileError.message}`)
  if (!profile) return false
  const limit = X_DAILY_SPEND_LIMIT_CENTS[profile.plan] || 0
  if (limit === 0) return false

  // Cost per search in cents. Live value is ~5 cents depending on operation.
  const estimatedCostCents = parseInt(process.env.X_SEARCH_COST_CENTS || '5', 10)

  const { data, error } = await supabase.rpc('increment_x_spend_if_under_limit', {
    p_user_id: userId, 
    p_cost_cents: estimatedCostCents, 
    p_daily_limit_cents: limit,
  })

  if (error) {
    throw new Error(`Failed to reserve X spend budget: ${error.message}`)
  }

  return data
}
