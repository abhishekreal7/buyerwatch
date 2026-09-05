import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getIp, searchRateLimit } from '@/lib/ratelimit'
import { normalizeHighIntentThreshold } from '@/lib/high-intent-threshold'
import { logger } from '@/lib/logger'

const MAX_RESULTS = 50
const ACTIVE_STATUSES = ['pending', 'drafted', 'needs_manual_reply']

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = (searchParams.get('q') ?? '').trim()
  const tab = searchParams.get('tab') ?? 'all'
  const threshold = normalizeHighIntentThreshold(searchParams.get('threshold'))
  const requestedLimit = Number(searchParams.get('limit') ?? MAX_RESULTS)
  const requestedOffset = Number(searchParams.get('cursor') ?? 0)
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, MAX_RESULTS))
    : MAX_RESULTS
  const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
    ? Math.min(requestedOffset, 10_000_000)
    : 0

  if (!query || query.length > 100 || !['all', 'high-intent', 'dismissed'].includes(tab)) {
    return NextResponse.json({ error: 'invalid_search' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rate = await searchRateLimit.limit(`conversation-search:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const statuses = tab === 'dismissed' ? ['dismissed'] : ACTIVE_STATUSES
    const { data, error } = await supabase.rpc('search_monitored_threads_v1', {
      p_query: query,
      p_statuses: statuses,
      p_min_intent: tab === 'high-intent' ? threshold : null,
      p_limit: limit,
      p_offset: offset,
    })
    if (error) throw error
    const rows = (data ?? []) as Array<{ thread: Record<string, unknown>; total_count: number }>
    const total = Number(rows[0]?.total_count ?? 0)
    const threads = rows.map(row => row.thread)
    return NextResponse.json(
      {
        threads,
        total,
        nextCursor: offset + threads.length < total ? offset + threads.length : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    logger.error(
      { code: error instanceof Error ? error.name : 'unknown' },
      'Conversation search failed',
    )
    return NextResponse.json({ error: 'search_failed' }, { status: 500 })
  }
}
