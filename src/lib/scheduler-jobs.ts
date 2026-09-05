import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  blueskyFetchQueue,
  redditFetchQueue,
  sendDigestQueue,
  xFetchQueue,
} from './queues'
import {
  canMonitorPlatform,
  isPollingDue,
  normalizePlan,
} from './plan-limits'
import { isXDiscoveryConfigured } from './x'
import { hasActiveSubscription } from './billing-entitlements'
import { createUnsubscribeUrl } from './email-preferences'

type KeywordRow = {
  id: string
  platform: 'reddit' | 'bluesky' | 'x' | 'threads'
  target: string
  term: string
  user_id: string
  last_success_at?: string | null
  next_poll_at?: string | null
  profiles:
    | { plan?: string; billing_status?: string; billing_subscription_id?: string | null; last_polled_at?: string | null }
    | Array<{ plan?: string; billing_status?: string; billing_subscription_id?: string | null; last_polled_at?: string | null }>
}

function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export function monitoringJobBucket(now: Date): string {
  // The fastest paid cadence is five minutes. A 15-minute job-id bucket would
  // silently deduplicate two out of every three Pro/Growth polling jobs.
  return `${now.toISOString().slice(0, 14)}${Math.floor(now.getUTCMinutes() / 5)}`
}

function targetId(platform: string, target: string, bucket: string): string {
  const digest = createHash('sha256')
    .update(`${platform}\0${target}`)
    .digest('hex')
    .slice(0, 20)
  return `${platform}-${digest}-${bucket}`
}

export async function enqueueDueMonitoring(now = new Date()): Promise<{
  jobs: number
  usersPolled: number
}> {
  const supabase = getSupabaseAdmin()
  const pageSize = 500
  const rows: KeywordRow[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('keywords')
      .select('id, platform, target, term, user_id, last_success_at, next_poll_at, profiles!inner(plan, billing_status, billing_subscription_id, last_polled_at)')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...((data ?? []) as KeywordRow[]))
    if ((data?.length ?? 0) < pageSize) break
  }

  const xEnabled = isXDiscoveryConfigured()
  const dueUsers = new Set<string>()
  const jobs = new Map<string, {
    platform: KeywordRow['platform']
    target: string
    mappings: Array<{ id: string; user_id: string; term: string }>
  }>()

  for (const keyword of rows) {
    const profile = Array.isArray(keyword.profiles)
      ? keyword.profiles[0]
      : keyword.profiles
    const plan = normalizePlan(profile?.plan)
    if (!hasActiveSubscription(profile)) continue
    const nextPollAt = Date.parse(keyword.next_poll_at ?? '')
    if (Number.isFinite(nextPollAt) && nextPollAt > now.getTime()) continue
    if (!isPollingDue(
      plan,
      keyword.last_success_at,
      now.getTime(),
    )) continue
    if (!canMonitorPlatform(plan, keyword.platform)) continue
    if (
      keyword.platform === 'x'
      && !xEnabled
    ) {
      continue
    }

    dueUsers.add(keyword.user_id)
    const canonicalTarget = keyword.platform === 'reddit'
      ? keyword.target.trim().toLowerCase()
      : keyword.target.trim()
    const key = `${keyword.platform}\0${canonicalTarget}`
    const job = jobs.get(key) ?? {
      platform: keyword.platform,
      target: canonicalTarget,
      mappings: [],
    }
    job.mappings.push({
      id: keyword.id,
      user_id: keyword.user_id,
      term: keyword.term,
    })
    jobs.set(key, job)
  }

  const bucket = monitoringJobBucket(now)
  for (const job of jobs.values()) {
    const queue =
      job.platform === 'reddit'
        ? redditFetchQueue
        : job.platform === 'bluesky'
          ? blueskyFetchQueue
          : xFetchQueue

    await queue.add(
      'fetch',
      { target: job.target, keywordMappings: job.mappings },
      { jobId: targetId(job.platform, job.target, bucket) },
    )
  }

  // A queued job is not a successful source poll. Fetch handlers advance the
  // per-keyword and profile heartbeat only after the source responds.
  return { jobs: jobs.size, usersPolled: dueUsers.size }
}

function isoWeekKey(date: Date): string {
  const value = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ))
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function enqueueWeeklyDigests(now = new Date()): Promise<{
  configured: boolean
  digestsQueued: number
}> {
  if (
    !process.env.RESEND_API_KEY
    || !process.env.RESEND_FROM_EMAIL
    || !process.env.EMAIL_UNSUBSCRIBE_SECRET
  ) {
    return { configured: false, digestsQueued: 0 }
  }

  const supabase = getSupabaseAdmin()
  const pageSize = 500
  const profiles: Array<{
    id: string
    notification_preferences: Record<string, boolean> | null
  }> = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, notification_preferences')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    profiles.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
  }

  const opportunities: Array<Record<string, unknown> & { user_id: string }> = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .rpc('get_digest_opportunities', {
        p_since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
        p_min_score: 70,
        p_per_user: 10,
      })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    opportunities.push(...((data ?? []) as typeof opportunities))
    if ((data?.length ?? 0) < pageSize) break
  }

  const eligibleProfiles = new Set(
    profiles
      .filter(({ notification_preferences: preferences }) =>
        Boolean(preferences?.weeklyReport || preferences?.emailDigest))
      .map(({ id }) => id),
  )

  const emailsByUser = new Map<string, string>()
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: pageSize,
    })
    if (error) throw error
    for (const user of data.users) {
      if (user.email && eligibleProfiles.has(user.id)) {
        emailsByUser.set(user.id, user.email)
      }
    }
    if (data.users.length < pageSize) break
  }

  const opportunitiesByUser = new Map<string, typeof opportunities>()
  for (const opportunity of opportunities) {
    const existing = opportunitiesByUser.get(opportunity.user_id) ?? []
    existing.push(opportunity)
    opportunitiesByUser.set(opportunity.user_id, existing)
  }

  let digestsQueued = 0
  const week = isoWeekKey(now)
  for (const [userId, items] of opportunitiesByUser) {
    const email = emailsByUser.get(userId)
    if (!email || items.length === 0) continue
    await sendDigestQueue.add(
      'digest',
      { userId, email, items, unsubscribeUrl: createUnsubscribeUrl(userId, now) },
      { jobId: `digest-${userId}-${week}` },
    )
    digestsQueued += 1
  }

  return { configured: true, digestsQueued }
}
