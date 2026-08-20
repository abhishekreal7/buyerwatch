import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getIp, searchRateLimit } from '@/lib/ratelimit'
import { normalizeHighIntentThreshold } from '@/lib/high-intent-threshold'

const PAGE_SIZE = 500
const ACTIVE_STATUSES = ['pending', 'drafted', 'needs_manual_reply']
const SELECT_THREADS = '*, reply_analytics(draft_text), keywords(term, target)'

function matchesSearch(thread: Record<string, unknown>, query: string) {
  const keyword = Array.isArray(thread.keywords)
    ? thread.keywords[0] as Record<string, unknown> | undefined
    : thread.keywords as Record<string, unknown> | null
  const searchableFields = [
    thread.title,
    thread.text_content,
    thread.platform,
    keyword?.term,
    keyword?.target,
  ]

  return searchableFields.some(value =>
    typeof value === 'string' && value.toLocaleLowerCase().includes(query),
  )
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = (searchParams.get('q') ?? '').trim().toLocaleLowerCase()
  const tab = searchParams.get('tab') ?? 'all'
  const threshold = normalizeHighIntentThreshold(searchParams.get('threshold'))

  if (!query || query.length > 100 || !['all', 'high-intent', 'dismissed'].includes(tab)) {
    return NextResponse.json({ error: 'invalid_search' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rate = await searchRateLimit.limit(`conversation-search:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const threads: Record<string, unknown>[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let threadsQuery: any = supabase
        .from('monitored_threads')
        .select(SELECT_THREADS)
        .eq('user_id', user.id)
        .not('intent_score', 'is', null)

      if (tab === 'dismissed') {
        threadsQuery = threadsQuery.eq('status', 'dismissed')
      } else {
        threadsQuery = threadsQuery.in('status', ACTIVE_STATUSES)
        if (tab === 'high-intent') {
          threadsQuery = threadsQuery.gte('intent_score', threshold)
        }
      }

      const { data, error } = await threadsQuery
        .order('source_created_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) throw error

      const page = (data ?? []) as Record<string, unknown>[]
      threads.push(...page)
      if (page.length < PAGE_SIZE) break
    }

    const matchingThreads = threads.filter(thread => matchesSearch(thread, query))
    return NextResponse.json(
      { threads: matchingThreads, total: matchingThreads.length },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[conversations/search] Search failed', error)
    return NextResponse.json({ error: 'search_failed' }, { status: 500 })
  }
}
