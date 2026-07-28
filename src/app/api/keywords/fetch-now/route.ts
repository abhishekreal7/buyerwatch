import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redditFetchQueue, blueskyFetchQueue, xFetchQueue } from '../../../../lib/queues'
import { logger } from '../../../../lib/logger'
import { fetchNowRateLimit, getIp } from '@/lib/ratelimit'
import { isUuid, readJsonBody, RequestInputError } from '@/lib/request'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function immediateJobId(platform: string, target: string, bucket: number) {
  const targetHash = createHash('sha256').update(target).digest('hex').slice(0, 20)
  return `${platform}-${targetHash}-${bucket}`
}

export async function POST(req: Request) {
  try {
    // Auth: verify the caller is a logged-in user
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readJsonBody<Record<string, unknown>>(req)
    const { keywordId } = body

    if (!isUuid(keywordId)) {
      return NextResponse.json({ error: 'Missing keywordId' }, { status: 400 })
    }
    const rate = await fetchNowRateLimit.limit(`fetch-now:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // Verify the keyword belongs to the authenticated user
    const { data: triggeringKeyword, error: kwError } = await supabase
      .from('keywords')
      .select('platform, target')
      .eq('id', keywordId)
      .eq('user_id', user.id)
      .single()

    if (kwError || !triggeringKeyword) {
      return NextResponse.json({ error: 'Keyword not found' }, { status: 404 })
    }

    const { platform, target } = triggeringKeyword
    const cadenceBucket = Math.floor(Date.now() / (15 * 60_000))

    const supabaseAdmin = getSupabaseAdmin()
    // Fan-out: find ALL users watching this same target so the shared-fetch
    // architecture works correctly. The triggering user's keyword is enqueued
    // first to guarantee their aha-moment result arrives promptly.
    const allWatchers: Array<{ id: string; user_id: string; term: string }> = []
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseAdmin
        .from('keywords')
        .select('id, user_id, term')
        .eq('platform', platform)
        .eq('target', target)
        .eq('is_active', true)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      allWatchers.push(...(data ?? []))
      if ((data?.length ?? 0) < pageSize) break
    }

    // Sort: triggering user first, all others after
    const sorted = allWatchers.sort((a) => a.user_id === user.id ? -1 : 1)

    if (platform === 'reddit') {
      await redditFetchQueue.add('fetch', { target, keywordMappings: sorted }, {
        jobId: immediateJobId('reddit', target, cadenceBucket)
      })
    } else if (platform === 'bluesky') {
      await blueskyFetchQueue.add('fetch', { target, keywordMappings: sorted }, {
        jobId: immediateJobId('bluesky', target, cadenceBucket)
      })
    } else if (platform === 'x' && process.env.ENABLE_X_DISCOVERY === 'true') {
      await xFetchQueue.add('fetch', { target, keywordMappings: sorted }, {
        jobId: immediateJobId('x', target, cadenceBucket)
      })
    } else {
      return NextResponse.json({ error: 'platform_not_enabled' }, { status: 409 })
    }

    return NextResponse.json({ success: true, platform, target, watcherCount: sorted.length })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    logger.error({ error }, 'Error in fetch-now endpoint')
    return NextResponse.json({ error: 'fetch_enqueue_failed' }, { status: 500 })
  }
}
