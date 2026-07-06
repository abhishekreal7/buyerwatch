import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { redditFetchQueue, blueskyFetchQueue, xFetchQueue } from '../../../../lib/queues'
import { logger } from '../../../../lib/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { keywordId } = body

    if (!keywordId) {
      return NextResponse.json({ error: 'Missing keywordId' }, { status: 400 })
    }

    // Lookup the keyword
    const { data: keyword, error } = await supabase
      .from('keywords')
      .select('platform, target')
      .eq('id', keywordId)
      .single()

    if (error || !keyword) {
      return NextResponse.json({ error: 'Keyword not found' }, { status: 404 })
    }

    const { platform, target } = keyword
    const hourBucket = `fetch-now-${Date.now()}` // Ensure uniqueness for immediate jobs

    // Enqueue to the appropriate platform
    if (platform === 'reddit') {
      await redditFetchQueue.add('fetch', { target }, { jobId: `reddit-${target}-${hourBucket}` })
    } else if (platform === 'bluesky') {
      await blueskyFetchQueue.add('fetch', { target }, { jobId: `bluesky-${target}-${hourBucket}` })
    } else if (platform === 'x') {
      await xFetchQueue.add('fetch', { target }, { jobId: `x-${target}-${hourBucket}` })
    }

    return NextResponse.json({ success: true, platform, target })
  } catch (error: any) {
    logger.error({ error }, 'Error in fetch-now endpoint')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
