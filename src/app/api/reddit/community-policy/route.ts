import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  getSubredditCommunityPolicy,
  normalizeSubreddit,
} from '@/lib/reddit-community-policy'
import { communityPolicyRateLimit, getIp } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

/**
 * Returns the current deterministic Reddit policy verdict for a monitored
 * community. The underlying lookup is user-scoped because it uses that
 * account's OAuth token and therefore never exposes another customer's data.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const target = new URL(request.url).searchParams.get('subreddit')
    const subreddit = normalizeSubreddit(target)
    if (!subreddit) return NextResponse.json({ error: 'invalid_subreddit' }, { status: 400 })

    const rate = await communityPolicyRateLimit.limit(`reddit-policy:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const policy = await getSubredditCommunityPolicy(user.id, subreddit)
    return NextResponse.json(
      { policy },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    )
  } catch (error) {
    console.error('[reddit/community-policy] Failed to load community policy', error)
    return NextResponse.json({ error: 'community_policy_unavailable' }, { status: 503 })
  }
}
