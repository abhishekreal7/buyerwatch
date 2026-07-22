import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redditFetchQueue, blueskyFetchQueue, xFetchQueue } from '../../../../lib/queues'
import { logger } from '../../../../lib/logger'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    // Auth: verify the caller is a logged-in user
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { keywordId } = body

    if (!keywordId) {
      return NextResponse.json({ error: 'Missing keywordId' }, { status: 400 })
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
    const hourBucket = `fetch-now-${Date.now()}` // Ensure uniqueness for immediate jobs

    // Fan-out: find ALL users watching this same target so the shared-fetch
    // architecture works correctly. The triggering user's keyword is enqueued
    // first to guarantee their aha-moment result arrives promptly.
    const { data: allWatchers } = await supabaseAdmin
      .from('keywords')
      .select('id, user_id')
      .eq('platform', platform)
      .eq('target', target)
      .eq('is_active', true)

    // Sort: triggering user first, all others after
    const sorted = (allWatchers || []).sort((a) => a.user_id === user.id ? -1 : 1)

    if (platform === 'reddit') {
      await redditFetchQueue.add('fetch', { target, keywordMappings: sorted }, {
        jobId: `reddit-${target}-${hourBucket}`
      })
    } else if (platform === 'bluesky') {
      await blueskyFetchQueue.add('fetch', { target, keywordMappings: sorted }, {
        jobId: `bluesky-${target}-${hourBucket}`
      })
    } else if (platform === 'x') {
      await xFetchQueue.add('fetch', { target, keywordMappings: sorted }, {
        jobId: `x-${target}-${hourBucket}`
      })
    }

    return NextResponse.json({ success: true, platform, target, watcherCount: sorted.length })
  } catch (error: any) {
    logger.error({ error }, 'Error in fetch-now endpoint')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

