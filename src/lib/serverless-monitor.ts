import { createClient } from '@supabase/supabase-js'
import { getConfiguredSecret } from './env'
import { logger } from './logger'
import { canMonitorPlatform, getPlanLimits, isPollingDue, normalizePlan } from './plan-limits'
import { redis } from './redis'
import {
  buildSocialScoreCandidates,
  type SocialKeywordMapping,
  type SocialScoreCandidate,
} from './reddit-candidates'
import { searchBlueskyPosts } from './bluesky'
import { fetchXPosts, isXDiscoveryConfigured } from './x'
import { fetchSubredditNewWithSource, type RedditDiscoverySource } from './reddit'
import { getRedditDiscoveryCapacity } from './reddit-discovery-capacity'
import { dispatchPendingOutbox, recoverStaleSends, withRedisLock } from './backend-maintenance'
import {
  MONITORING_RUN_LOCK_KEY,
  MONITORING_RUN_LOCK_TTL_MS,
} from './monitoring-lock'
import { withScoreLock } from './score-lock'
import { processScorePost } from '../../worker/handlers/score-post'
import { isRedditDirectPostingConfigured } from './reddit-post'
import {
  recordKeywordPollFailure,
  recordKeywordPollSuccess,
} from './keyword-poll-health'
import { DISCOVERY_MAX_AGE_MS } from './content-freshness'
import { getEntitledPlan, hasActiveSubscription } from './billing-entitlements'

type MonitorPlatform = 'reddit' | 'bluesky' | 'x'

type KeywordRow = SocialKeywordMapping & {
  platform: MonitorPlatform
  target: string
  last_success_at?: string | null
  next_poll_at?: string | null
  profiles:
    | { plan?: string; billing_status?: string; billing_subscription_id?: string | null; last_polled_at?: string | null; competitors?: string[] | null }
    | Array<{ plan?: string; billing_status?: string; billing_subscription_id?: string | null; last_polled_at?: string | null; competitors?: string[] | null }>
}

type TargetWork = {
  platform: MonitorPlatform
  target: string
  mappings: SocialKeywordMapping[]
}

type CompletedTargetWork = TargetWork & {
  redditSource?: RedditDiscoverySource
}

export type ServerlessMonitorResult = {
  status: 'completed' | 'already_running'
  targetsFetched: number
  checkpointsFound: number
  candidatesFound: number
  candidatesProcessed: number
  candidatesDeferred: number
  usersPolled: number
}

function positiveInteger(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

function profileFor(row: KeywordRow) {
  return Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
}

function candidateKey(candidate: SocialScoreCandidate): string {
  return `${candidate.userId}\0${candidate.post.platform}\0${candidate.post.externalId}`
}

async function reserveXCapacity(
  supabase: ReturnType<typeof createClient<any>>,
  mappings: SocialKeywordMapping[],
): Promise<SocialKeywordMapping[]> {
  const costCents = Number.parseInt(process.env.X_SEARCH_COST_CENTS || '5', 10)
  if (!Number.isInteger(costCents) || costCents < 1) {
    throw new Error('X_SEARCH_COST_CENTS must be a positive integer')
  }
  const allowedUsers = new Set<string>()
  for (const userId of new Set(mappings.map(mapping => mapping.user_id))) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, billing_status, billing_subscription_id')
      .eq('id', userId)
      .single()
    if (profileError) throw new Error(`Unable to load X plan: ${profileError.message}`)
    const dailyLimit = getPlanLimits(getEntitledPlan(profile)).xDailySpendLimitCents
    if (dailyLimit === 0) continue
    const { data: reserved, error: reserveError } = await (supabase.rpc as unknown as (
      functionName: string,
      args: { p_user_id: string; p_cost_cents: number; p_daily_limit_cents: number },
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>)(
      'increment_x_spend_if_under_limit',
      { p_user_id: userId, p_cost_cents: costCents, p_daily_limit_cents: dailyLimit },
    )
    if (reserveError) throw new Error(`Unable to reserve X capacity: ${reserveError.message}`)
    if (reserved) allowedUsers.add(userId)
  }
  return mappings.filter(mapping => allowedUsers.has(mapping.user_id))
}

async function loadDueSocialWork(
  now: Date,
  forceUserId?: string,
  forcePlatform?: MonitorPlatform,
  forceTarget?: string,
): Promise<{
  work: TargetWork[]
  dueUsers: Set<string>
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const rows: KeywordRow[] = []
  const pageSize = 500

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('keywords')
      .select('id, platform, target, term, user_id, last_success_at, next_poll_at, profiles!inner(plan, billing_status, billing_subscription_id, last_polled_at, competitors)')
      .in('platform', ['reddit', 'bluesky', 'x'])
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...((data ?? []) as KeywordRow[]))
    if ((data?.length ?? 0) < pageSize) break
  }

  const forced = Boolean(forceUserId)
  const relevantRows = rows.filter((row) =>
    (!forceUserId || row.user_id === forceUserId)
    && (!forcePlatform || row.platform === forcePlatform)
    && hasActiveSubscription(profileFor(row))
    && canMonitorPlatform(normalizePlan(profileFor(row)?.plan), row.platform)
    && (row.platform !== 'x' || isXDiscoveryConfigured()),
  )
  const dueUsers = new Set<string>()
  const targets = new Map<string, TargetWork>()
  for (const row of relevantRows) {
    const profile = profileFor(row)
    const nextPollAt = Date.parse(row.next_poll_at ?? '')
    if (!forced && Number.isFinite(nextPollAt) && nextPollAt > now.getTime()) continue
    if (
      !forced
      && !isPollingDue(
        normalizePlan(profile?.plan),
        row.last_success_at,
        now.getTime(),
      )
    ) {
      continue
    }

    const target = row.platform === 'reddit'
      ? row.target.trim().toLowerCase()
      : row.target.trim()
    if (forceTarget && target !== forceTarget) continue
    dueUsers.add(row.user_id)
    const key = `${row.platform}\0${target}`
    const item = targets.get(key) ?? { platform: row.platform, target, mappings: [] }
    item.mappings.push({
      id: row.id,
      user_id: row.user_id,
      term: row.term,
      competitors: profile?.competitors ?? [],
    })
    targets.set(key, item)
  }

  return {
    work: [...targets.values()].sort((left, right) =>
      `${left.platform}:${left.target}`.localeCompare(`${right.platform}:${right.target}`),
    ),
    dueUsers,
  }
}

async function loadPendingSocialCheckpoints(
  forceUserId?: string,
): Promise<SocialScoreCandidate[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  let query = supabase
    .from('monitored_threads')
    .select('user_id, keyword_id, platform, external_id, author, title, text_content, url, source_created_at, created_at, keywords!inner(target), profiles!monitored_threads_user_id_fkey!inner(plan, billing_status, billing_subscription_id)')
    .in('platform', ['reddit', 'bluesky', 'x'])
    .eq('status', 'pending')
    .gte('source_created_at', new Date(Date.now() - DISCOVERY_MAX_AGE_MS).toISOString())
    .eq('profiles.billing_status', 'active')
    .not('profiles.billing_subscription_id', 'is', null)
    .neq('profiles.plan', 'free')
    .order('created_at', { ascending: true })
    .limit(25)
  if (forceUserId) query = query.eq('user_id', forceUserId)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).filter((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return hasActiveSubscription(profile)
      && canMonitorPlatform(getEntitledPlan(profile), row.platform)
  }).map((row) => {
    const keyword = Array.isArray(row.keywords) ? row.keywords[0] : row.keywords
    return {
      userId: row.user_id,
      keywordId: row.keyword_id,
      post: {
        platform: row.platform as MonitorPlatform,
        externalId: row.external_id,
        author: row.author ?? '',
        title: row.title ?? undefined,
        text: row.text_content ?? '',
        url: row.url,
        createdAt: row.source_created_at || row.created_at,
        sourceTarget: keyword?.target ?? row.platform,
      },
    }
  })
}

async function removePersistedCandidates(
  candidates: SocialScoreCandidate[],
): Promise<SocialScoreCandidate[]> {
  if (candidates.length === 0) return []

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const externalIds = [...new Set(candidates.map(({ post }) => post.externalId))]
  const userIds = [...new Set(candidates.map(({ userId }) => userId))]
  const { data, error } = await supabase
    .from('monitored_threads')
    .select('user_id, platform, external_id, status')
    .in('platform', ['reddit', 'bluesky', 'x'])
    .in('external_id', externalIds)
    .in('user_id', userIds)
  if (error) throw error

  const persisted = new Set(
    (data ?? [])
      .filter((row) => row.status !== 'pending')
      .map((row) => `${row.user_id}\0${row.platform}\0${row.external_id}`),
  )
  const unique = new Map<string, SocialScoreCandidate>()
  for (const candidate of candidates) {
    const key = candidateKey(candidate)
    if (!persisted.has(key) && !unique.has(key)) unique.set(key, candidate)
  }
  return [...unique.values()]
}

async function persistPendingCandidates(
  candidates: SocialScoreCandidate[],
): Promise<void> {
  if (candidates.length === 0) return

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await supabase
    .from('monitored_threads')
    .upsert(
      candidates.map(({ userId, keywordId, post }) => ({
        user_id: userId,
        keyword_id: keywordId,
        platform: post.platform,
        external_id: post.externalId,
        author: post.author || null,
        title: post.title || null,
        text_content: post.text,
        url: post.url,
        source_created_at: post.createdAt,
        intent_score: null,
        intent_label: null,
        status: 'pending',
        score_reasoning: 'Awaiting analysis',
        automation_reason: 'analysis_pending',
      })),
      {
        onConflict: 'user_id,platform,external_id',
        ignoreDuplicates: true,
      },
    )
  if (error) throw error
}

async function runLockedMonitor(
  now: Date,
  forceUserId?: string,
  forcePlatform?: MonitorPlatform,
  forceTarget?: string,
): Promise<ServerlessMonitorResult> {
  // Keep the serverless scheduler capable of recovering delivery work when
  // the always-on worker is unavailable.
  await recoverStaleSends(now)

  const maintenanceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: staleCheckpointError } = await maintenanceClient.rpc(
    'quarantine_stale_pending_threads_v1',
    { p_cutoff: new Date(now.getTime() - DISCOVERY_MAX_AGE_MS).toISOString() },
  )
  if (staleCheckpointError) {
    throw new Error(`Unable to quarantine stale discovery checkpoints: ${staleCheckpointError.message}`)
  }

  const maxScores = positiveInteger(
    process.env.SERVERLESS_MONITOR_MAX_SCORES,
    getConfiguredSecret(process.env.ANTHROPIC_API_KEY) ? 1 : 5,
    5,
  )
  const maxTargets = positiveInteger(
    process.env.SERVERLESS_MONITOR_MAX_TARGETS,
    50,
    100,
  )
  const [checkpoints, dueWork] = await Promise.all([
    loadPendingSocialCheckpoints(forceUserId),
    loadDueSocialWork(now, forceUserId, forcePlatform, forceTarget),
  ])
  const { work: allWork } = dueWork
  let work = allWork
  if (!forceTarget && allWork.length > maxTargets) {
    const cursor = await redis.incr('cursor:serverless-social-target')
    const start = ((cursor - 1) * maxTargets) % allWork.length
    work = Array.from({ length: maxTargets }, (_, index) =>
      allWork[(start + index) % allWork.length],
    )
  }
  const discovered: SocialScoreCandidate[] = []
  const completedWork: CompletedTargetWork[] = []
  const failedWork: Array<{ target: TargetWork; error: unknown }> = []
  const redditCapacity = await getRedditDiscoveryCapacity()
  if (redditCapacity.mode === 'rss_only') {
    logger.warn({
      reason: redditCapacity.reason,
      readBudget: redditCapacity.readBudget,
    }, 'Reddit discovery is using the RSS fallback; paid provider reads are paused safely')
  }

  for (let index = 0; index < work.length; index += 6) {
    const batch = work.slice(index, index + 6)
    const results = await Promise.allSettled(batch.map(async (target, idx) => {
      if (target.platform === 'reddit') {
        if (idx > 0) {
          await new Promise(r => setTimeout(r, idx * 800))
        }
        const result = await fetchSubredditNewWithSource(target.target, 25, {
          mode: redditCapacity.mode,
        })
        return {
          candidates: buildSocialScoreCandidates(result.posts, target.mappings).candidates,
          redditSource: result.source,
        }
      }
      if (target.platform === 'x') {
        const mappings = await reserveXCapacity(maintenanceClient, target.mappings)
        if (mappings.length === 0) {
          return { candidates: [] }
        }
        const posts = await fetchXPosts(target.target)
        return {
          candidates: buildSocialScoreCandidates(posts, mappings).candidates,
        }
      }
      const posts = await searchBlueskyPosts(target.target, 25)
      return {
        candidates: buildSocialScoreCandidates(posts, target.mappings).candidates,
      }
    }))
    for (const [resultIndex, result] of results.entries()) {
      const target = batch[resultIndex]
      if (result.status === 'fulfilled') {
        completedWork.push({ ...target, redditSource: result.value.redditSource })
        discovered.push(...result.value.candidates)
      } else {
        failedWork.push({ target, error: result.reason })
        logger.warn({
          error: result.reason,
          platform: target.platform,
          target: target.target,
        }, 'Social target fetch failed; leaving it due for the next run')
      }
    }
  }
  if (work.length > 0 && completedWork.length === 0) {
    await Promise.all(failedWork.map(({ target, error }) =>
      recordKeywordPollFailure(target.mappings.map(({ id }) => id), error, now),
    ))
    throw new Error('All due social target fetches failed')
  }

  await Promise.all([
    ...completedWork.map(target =>
      recordKeywordPollSuccess(
        target.mappings.map(({ id }) => id),
        now,
        target.redditSource === 'rss' ? 'reddit_rss' : undefined,
      ),
    ),
    ...failedWork.map(({ target, error }) =>
      recordKeywordPollFailure(target.mappings.map(({ id }) => id), error, now),
    ),
  ])

  const discoveredCandidates = await removePersistedCandidates(discovered)
  discoveredCandidates.sort((left, right) =>
    Date.parse(right.post.createdAt) - Date.parse(left.post.createdAt),
  )
  // Save discovery before paid AI work. A timeout, provider failure, or spend
  // limit can then be recovered by the next scheduled invocation.
  await persistPendingCandidates(discoveredCandidates)
  const pendingByKey = new Map<string, SocialScoreCandidate>()
  for (const candidate of [...checkpoints, ...discoveredCandidates]) {
    const key = candidateKey(candidate)
    if (!pendingByKey.has(key)) pendingByKey.set(key, candidate)
  }
  const pending = [...pendingByKey.values()]
  const selected = pending.slice(0, maxScores)
  const deferred = pending.slice(maxScores)
  let candidatesProcessed = 0

  for (const candidate of selected) {
    const allowAutoSend = candidate.post.platform === 'bluesky'
      || isRedditDirectPostingConfigured()
    const processed = await withScoreLock(
      candidate.userId,
      candidate.post.externalId,
      () => processScorePost(candidate, {
        allowAutoSend,
        enqueueFollowUpJobs: false,
        providerRetries: 0,
      }),
    )
    if (processed === null) {
      deferred.push(candidate)
    } else {
      candidatesProcessed += 1
      if (allowAutoSend) await dispatchPendingOutbox(10)
    }
  }

  // A successful feed fetch is the polling heartbeat. Candidate analysis has
  // its own durable pending checkpoints and must not force the same feed to be
  // fetched again while that backlog drains.
  const usersPolled = [...new Set(
    completedWork.flatMap(({ mappings }) => mappings.map(({ user_id }) => user_id)),
  )]
  return {
    status: 'completed',
    targetsFetched: completedWork.length,
    checkpointsFound: checkpoints.length,
    candidatesFound: pending.length,
    candidatesProcessed,
    candidatesDeferred: deferred.length,
    usersPolled: usersPolled.length,
  }
}

export async function runServerlessMonitoring(
  now = new Date(),
  options: {
    forceUserId?: string
    forcePlatform?: MonitorPlatform
    forceTarget?: string
  } = {},
): Promise<ServerlessMonitorResult> {
  const result = await withRedisLock(
    redis,
    MONITORING_RUN_LOCK_KEY,
    MONITORING_RUN_LOCK_TTL_MS,
    () => runLockedMonitor(
      now,
      options.forceUserId,
      options.forcePlatform,
      options.forceTarget,
    ),
  )

  if (result) return result
  logger.info('Serverless social monitor skipped because another run owns the lock')
  return {
    status: 'already_running',
    targetsFetched: 0,
    checkpointsFound: 0,
    candidatesFound: 0,
    candidatesProcessed: 0,
    candidatesDeferred: 0,
    usersPolled: 0,
  }
}
