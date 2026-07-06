import { logger } from '../../src/lib/logger';
import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import { fetchXPosts } from '../../src/lib/x'
import { scorePostQueue } from '../../src/lib/queues'
import { X_DAILY_SPEND_LIMIT_CENTS } from '../../src/lib/plan-limits'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { supabaseWorker as supabase } from '../lib/supabase'

export async function xFetchHandler(job: Job) {
  const { target } = job.data

  try {
    const posts = await fetchXPosts(target)
    
    if (!posts || posts.length === 0) return

    // Find all users watching this specific X target
    const { data: keywordMappings, error } = await supabase
      .from('keywords')
      .select('id, user_id, term')
      .eq('platform', 'x')
      .eq('target', target)
      .eq('is_active', true)

    if (error) {
      logger.error({ error }, 'Supabase error fetching keywords:')
      return
    }

    if (!keywordMappings || keywordMappings.length === 0) return

    for (const post of posts) {
      const postText = `${post.text || ''}`.toLowerCase()

      for (const mapping of keywordMappings) {
        if (postText.includes(mapping.term.toLowerCase())) {
          // Check X spend budget BEFORE enqueueing scoring
          const canAfford = await checkXSpendBudget(mapping.user_id)
          if (!canAfford) {
            logger.info(`[Budget] User ${mapping.user_id} exceeded X spend limit. Skipping post.`)
            continue
          }

          // Push to score queue
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
    logger.error({ error }, `Failed to fetch X target ${target}:`)
    throw error
  }
}

async function checkXSpendBudget(userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single()

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
    logger.error({ error }, 'Error checking X spend budget:')
    return false
  }

  return data
}
