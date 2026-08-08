import { createClient } from '@supabase/supabase-js'
import { getConfiguredSecret } from './env'
import { logger } from './logger'
import { isPollingDue, normalizePlan } from './plan-limits'
import { redis } from './redis'
import {
  buildSocialScoreCandidates,
  type SocialKeywordMapping,
  type SocialScoreCandidate,
} from './reddit-candidates'
import { searchBlueskyPosts } from './bluesky'
import { fetchSubredditNew } from './reddit'
import { dispatchPendingOutbox, recoverStaleSends, withRedisLock } from './backend-maintenance'
import {
  MONITORING_RUN_LOCK_KEY,
  MONITORING_RUN_LOCK_TTL_MS,
} from './monitoring-lock'
import { withScoreLock } from './score-lock'
import { processScorePost } from '../../worker/handlers/score-post'
import { isRedditDirectPostingConfigured } from './reddit-post'

type MonitorPlatform = 'reddit' | 'bluesky'

type KeywordRow = SocialKeywordMapping & {
  platform: MonitorPlatform
  target: string
  profiles:
    | { plan?: string; last_polled_at?: string | null; competitors?: string[] | null }
    | Array<{ plan?: string; last_polled_at?: string | null; competitors?: string[] | null }>
}

type TargetWork = {
  platform: MonitorPlatform
  target: string
  mappings: SocialKeywordMapping[]
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
      .select('id, platform, target, term, user_id, profiles!inner(plan, last_polled_at, competitors)')
      .in('platform', ['reddit', 'bluesky'])
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
    && (!forcePlatform || row.platform === forcePlatform),
  )
  const pollKeys = relevantRows.map((row) => `poll:keyword:${row.id}`)
  const lastPolledValues = pollKeys.length > 0 ? await redis.mget(...pollKeys) : []

  const dueUsers = new Set<string>()
  const targets = new Map<string, TargetWork>()
  for (const [index, row] of relevantRows.entries()) {
    const profile = profileFor(row)
    if (
      !forced
      && !isPollingDue(
        normalizePlan(profile?.plan),
        lastPolledValues[index] || profile?.last_polled_at,
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
    .select('user_id, keyword_id, platform, external_id, author, title, text_content, url, source_created_at, created_at, keywords!inner(target)')
    .in('platform', ['reddit', 'bluesky'])
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25)
  if (forceUserId) query = query.eq('user_id', forceUserId)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row) => {
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
    .in('platform', ['reddit', 'bluesky'])
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

async function markUsersPolled(userIds: string[], now: Date): Promise<void> {
  if (userIds.length === 0) return
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await supabase
    .from('profiles')
    .update({ last_polled_at: now.toISOString() })
    .in('id', userIds)
  if (error) throw error
}

async function markKeywordsPolled(work: TargetWork[], now: Date): Promise<void> {
  const keywordIds = [...new Set(
    work.flatMap(({ mappings }) => mappings.map(({ id }) => id)),
  )]
  if (keywordIds.length === 0) return

  const pipeline = redis.pipeline()
  const timestamp = now.toISOString()
  for (const keywordId of keywordIds) {
    pipeline.set(`poll:keyword:${keywordId}`, timestamp, 'EX', 7 * 24 * 60 * 60)
  }
  await pipeline.exec()
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
  const completedWork: TargetWork[] = []

  for (let index = 0; index < work.length; index += 6) {
    const batch = work.slice(index, index + 6)
    const results = await Promise.allSettled(batch.map(async (target) => {
      const posts = target.platform === 'reddit'
        ? await fetchSubredditNew(target.target, 25)
        : await searchBlueskyPosts(target.target, 25)
      return buildSocialScoreCandidates(posts, target.mappings).candidates
    }))
    for (const [resultIndex, result] of results.entries()) {
      const target = batch[resultIndex]
      if (result.status === 'fulfilled') {
        completedWork.push(target)
        discovered.push(...result.value)
      } else {
        logger.warn({
          error: result.reason,
          platform: target.platform,
          target: target.target,
        }, 'Social target fetch failed; leaving it due for the next run')
      }
    }
  }
  if (work.length > 0 && completedWork.length === 0) {
    throw new Error('All due social target fetches failed')
  }

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
  await Promise.all([
    markKeywordsPolled(completedWork, now),
    markUsersPolled(usersPolled, now),
  ])

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
