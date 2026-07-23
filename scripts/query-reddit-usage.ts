import * as dotenv from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // 1. All active Reddit keywords with their targets (subreddits) and plan
  const { data: keywords, error } = await supabase
    .from('keywords')
    .select('id, user_id, target, term, is_active, profiles!inner(plan)')
    .eq('platform', 'reddit')
    .eq('is_active', true)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('\n=== ACTIVE REDDIT KEYWORDS ===')
  console.log(`Total active Reddit keywords: ${keywords?.length ?? 0}`)
  
  // 2. Unique subreddits (deduped — this is what drives actual API calls)
  const uniqueSubreddits = new Set(keywords?.map(k => k.target) ?? [])
  console.log(`Unique subreddits (deduped API calls): ${uniqueSubreddits.size}`)
  console.log('Subreddits:', Array.from(uniqueSubreddits).sort())

  // 3. Plan breakdown
  const byPlan: Record<string, number> = {}
  keywords?.forEach(k => {
    const plan = (k.profiles as any).plan || 'free'
    byPlan[plan] = (byPlan[plan] || 0) + 1
  })
  console.log('\nKeywords by plan tier:', byPlan)

  // 4. Users breakdown
  const uniqueUsers = new Set(keywords?.map(k => k.user_id) ?? [])
  console.log(`Unique users with active Reddit keywords: ${uniqueUsers.size}`)

  // 5. Per-subreddit effective poll interval (fastest plan watching it wins the dedup)
  // From cron/enqueue/route.ts pollIntervalMin: free=360, pro=30
  const planIntervals: Record<string, number> = { pro: 30, free: 360 }
  const subredditIntervals: Record<string, number> = {}
  keywords?.forEach(k => {
    const plan = (k.profiles as any).plan || 'free'
    const interval = planIntervals[plan] ?? 360
    const cur = subredditIntervals[k.target] ?? 9999
    if (interval < cur) subredditIntervals[k.target] = interval
  })
  
  console.log('\n=== MONTHLY CALL VOLUME MATH ===')
  console.log('Poll intervals from cron/enqueue/route.ts: free=360min, pro=30min')
  console.log('Architecture: fetch-once-per-target (subreddit dedup across users)\n')
  
  let totalMonthlyCallsActual = 0
  for (const [sr, interval] of Object.entries(subredditIntervals)) {
    const polls = (30 * 24 * 60) / interval
    totalMonthlyCallsActual += polls
    console.log(`  r/${sr}: fastest_watcher_interval=${interval}min → ${polls} calls/month`)
  }

  const costPerCall = 0.002
  const monthlyCost = totalMonthlyCallsActual * costPerCall
  console.log(`\nTotal actual monthly redditapis.com calls: ${totalMonthlyCallsActual}`)
  console.log(`Cost @ $0.002/call: $${monthlyCost.toFixed(4)}/month`)

  // Envelope calculations
  const pollsPerMonthPro  = (30 * 24 * 60) / 30   // 1440
  const pollsPerMonthFree = (30 * 24 * 60) / 360  // 120

  const worstCaseCalls = uniqueSubreddits.size * pollsPerMonthPro
  const bestCaseCalls  = uniqueSubreddits.size * pollsPerMonthFree
  console.log(`\n--- Envelope ---`)
  console.log(`Worst case (all at pro/30min): ${uniqueSubreddits.size} × ${pollsPerMonthPro} = ${worstCaseCalls} calls → $${(worstCaseCalls * costPerCall).toFixed(4)}/mo`)
  console.log(`Best case (all at free/6hr):   ${uniqueSubreddits.size} × ${pollsPerMonthFree} = ${bestCaseCalls} calls → $${(bestCaseCalls * costPerCall).toFixed(4)}/mo`)
}

main().catch(console.error)
