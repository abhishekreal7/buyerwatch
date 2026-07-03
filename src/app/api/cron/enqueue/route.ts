import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { redditFetchQueue, blueskyFetchQueue, xFetchQueue } from '../../../../lib/queues'
import { X_DAILY_SPEND_LIMIT_CENTS } from '../../../../lib/plan-limits'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Returns current hour bucket like "2026-07-03-12"
function getHourBucket() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  
  // Strict security to ensure only Vercel Cron or admin hits this
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Define poll intervals (in minutes) per plan
  const pollIntervalMin: Record<string, number> = {
    free: 360,     // every 6 hours
    pro: 30,       // every 30 mins
    business: 15   // every 15 mins
  }

  try {
    // 1. Get all active keywords for all users
    const { data: keywords, error } = await supabase
      .from('keywords')
      .select('platform, target, user_id, profiles!inner(plan, last_polled_at)')
      .eq('is_active', true)

    if (error) throw error
    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ enqueued: true, message: 'No active keywords found' })
    }

    // 2. Filter users due for a poll
    const now = new Date()
    const dueUsers = new Set<string>()
    const targetsByPlatform: Record<string, Set<string>> = {
      reddit: new Set(),
      bluesky: new Set(),
      x: new Set(),
      threads: new Set()
    }

    for (const kw of keywords) {
      const plan = (kw.profiles as any).plan || 'free'
      const lastPolledAt = (kw.profiles as any).last_polled_at
      
      const intervalMs = pollIntervalMin[plan] * 60 * 1000
      
      const isDue = !lastPolledAt || (now.getTime() - new Date(lastPolledAt).getTime()) >= intervalMs
      
      if (isDue) {
        dueUsers.add(kw.user_id)
        
        // Explicitly filter X targets by business tier (or plan limit > 0)
        if (kw.platform === 'x' && (X_DAILY_SPEND_LIMIT_CENTS[plan] || 0) === 0) {
          continue // skip x targets for free/pro users
        }

        if (targetsByPlatform[kw.platform]) {
          targetsByPlatform[kw.platform].add(kw.target)
        }
      }
    }

    if (dueUsers.size === 0) {
      return NextResponse.json({ enqueued: true, message: 'No users due for polling' })
    }

    const hourBucket = getHourBucket()

    // 3. Enqueue fetch jobs by target (not per user)
    // Reddit
    for (const target of targetsByPlatform.reddit) {
      await redditFetchQueue.add('fetch', { target }, {
        jobId: `reddit-${target}-${hourBucket}`
      })
    }

    // Bluesky
    for (const target of targetsByPlatform.bluesky) {
      await blueskyFetchQueue.add('fetch', { target }, {
        jobId: `bluesky-${target}-${hourBucket}`
      })
    }

    // X
    for (const target of targetsByPlatform.x) {
      await xFetchQueue.add('fetch', { target }, {
        jobId: `x-${target}-${hourBucket}`
      })
    }

    // Threads: log skipped count
    console.log(`Skipped Threads targets: ${targetsByPlatform.threads.size}`)

    // 4. Update last_polled_at for due users
    const userIds = Array.from(dueUsers)
    // Supabase JS doesn't have an 'in' update for multiple rows directly easily in one call without rpc or matching.
    // We can do a quick rpc or just an in-filter update
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ last_polled_at: now.toISOString() })
      .in('id', userIds)

    if (updateError) {
      console.error('Error updating last_polled_at:', updateError)
    }

    // 5. Healthcheck dead-man's switch
    if (process.env.HEALTHCHECK_PING_URL) {
      fetch(process.env.HEALTHCHECK_PING_URL).catch(e => console.error('Healthcheck ping failed:', e))
    }

    return NextResponse.json({ 
      enqueued: true, 
      stats: {
        redditTargets: targetsByPlatform.reddit.size,
        blueskyTargets: targetsByPlatform.bluesky.size,
        xTargets: targetsByPlatform.x.size,
        usersPolled: userIds.length
      }
    })

  } catch (error: any) {
    console.error('Monitor cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
