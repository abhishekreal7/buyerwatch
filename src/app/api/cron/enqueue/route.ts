import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { redditFetchQueue, blueskyFetchQueue, xFetchQueue } from '@/lib/queues'
import { X_DAILY_SPEND_LIMIT_CENTS, isPollingDue, normalizePlan } from '@/lib/plan-limits'
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth'
import { fetchWithTimeout } from '@/lib/http'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type KeywordRow = {
  id: string
  platform: 'reddit' | 'bluesky' | 'x' | 'threads'
  target: string
  term: string
  user_id: string
  profiles: { plan?: string; last_polled_at?: string | null } | Array<{ plan?: string; last_polled_at?: string | null }>
}

function jobBucket(now: Date): string {
  return `${now.toISOString().slice(0, 14)}${Math.floor(now.getUTCMinutes() / 15)}`
}

function targetId(platform: string, target: string, bucket: string): string {
  const digest = createHash('sha256').update(`${platform}\0${target}`).digest('hex').slice(0, 20)
  return `${platform}-${digest}-${bucket}`
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('keywords')
      .select('id, platform, target, term, user_id, profiles!inner(plan, last_polled_at)')
      .eq('is_active', true)

    if (error) throw error

    const now = new Date()
    const dueUsers = new Set<string>()
    const jobs = new Map<string, { platform: KeywordRow['platform']; target: string; mappings: Array<{ id: string; user_id: string; term: string }> }>()

    for (const keyword of (data ?? []) as KeywordRow[]) {
      const profile = Array.isArray(keyword.profiles) ? keyword.profiles[0] : keyword.profiles
      const plan = normalizePlan(profile?.plan)
      if (!isPollingDue(plan, profile?.last_polled_at, now.getTime())) continue
      if (keyword.platform === 'threads') continue
      if (keyword.platform === 'x' && X_DAILY_SPEND_LIMIT_CENTS[plan] === 0) continue

      dueUsers.add(keyword.user_id)
      const key = `${keyword.platform}\0${keyword.target}`
      const job = jobs.get(key) ?? {
        platform: keyword.platform,
        target: keyword.target,
        mappings: [],
      }
      job.mappings.push({ id: keyword.id, user_id: keyword.user_id, term: keyword.term })
      jobs.set(key, job)
    }

    const bucket = jobBucket(now)
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

    const userIds = [...dueUsers]
    if (userIds.length > 0) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ last_polled_at: now.toISOString() })
        .in('id', userIds)
      if (updateError) throw updateError
    }

    if (process.env.HEALTHCHECK_PING_URL) {
      try {
        await fetchWithTimeout(process.env.HEALTHCHECK_PING_URL, {}, 5_000)
      } catch (error) {
        logger.warn({ error }, 'Monitor healthcheck ping failed')
      }
    }

    return NextResponse.json({
      enqueued: true,
      jobs: jobs.size,
      usersPolled: userIds.length,
    })
  } catch (error) {
    logger.error({ error }, 'Monitor cron failed')
    return NextResponse.json({ error: 'monitor_enqueue_failed' }, { status: 500 })
  }
}
