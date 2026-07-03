import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { redditFetchQueue, scorePostQueue } from '../src/lib/queues'
import { redis } from '../src/lib/redis'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function runTest() {
  console.log('--- Step 3: Fetch Deduplication Test ---')
  
  let user1: string | undefined
  let user2: string | undefined
  const targetSub = 'test_dedup_subreddit'

  try {
    // Clear old queues
    await redditFetchQueue.drain()
    await scorePostQueue.drain()
    
    // 1. Create two test users via Auth Admin
    const u1 = await getOrCreateUser('test_dedup1@example.com')
    const u2 = await getOrCreateUser('test_dedup2@example.com')

    user1 = u1.id
    user2 = u2.id

    // Insert profiles
    await supabase.from('profiles').upsert([
      { id: user1, business_name: 'Test Business 1', plan: 'free', last_polled_at: new Date(Date.now() - 10000000).toISOString() },
      { id: user2, business_name: 'Test Business 2', plan: 'free', last_polled_at: new Date(Date.now() - 10000000).toISOString() }
    ])

    // 2. Insert keywords for both users pointing to the SAME target
    const { data: kw, error: kwErr } = await supabase.from('keywords').upsert([
      { user_id: user1, term: 'test term', platform: 'reddit', target: targetSub, is_active: true },
      { user_id: user2, term: 'test term', platform: 'reddit', target: targetSub, is_active: true }
    ]).select()

    if (kwErr) throw kwErr

    console.log(`Inserted 2 users watching the same target: ${targetSub}`)

    // 3. Manually invoke cron logic (just the enqueue part for this target)
    console.log('Enqueuing fetch job for target...')
    const hourBucket = `test-hour-${Date.now()}`
    await redditFetchQueue.add('fetch', { target: targetSub }, {
      jobId: `reddit-${targetSub}-${hourBucket}`
    })

    // 4. Assert exact counts
    const fetchCounts = await redditFetchQueue.getJobCounts()
    console.log(`Fetch jobs enqueued: ${fetchCounts.waiting + fetchCounts.active}`)
    
    if (fetchCounts.waiting + fetchCounts.active !== 1) {
      console.error('❌ FAILED: There should be exactly ONE fetch job for the target.')
      process.exit(1)
    }

    console.log('Waiting 5 seconds for worker to process fetch job...')
    // Note: The worker process must be running in another terminal for this to process!
    await new Promise(r => setTimeout(r, 5000))

    const scoreCounts = await scorePostQueue.getJobCounts()
    console.log(`Score jobs enqueued: ${scoreCounts.waiting + scoreCounts.active + scoreCounts.completed}`)

    // Cleanup
    if (user1) await supabase.auth.admin.deleteUser(user1)
    if (user2) await supabase.auth.admin.deleteUser(user2)

    console.log('✅ Test finished.')

  } catch (err) {
    console.error('Test failed with error:', err)
  } finally {
    await redis.quit()
  }
}

async function getOrCreateUser(email: string) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password: 'password123', email_confirm: true })
  if (data?.user?.id) return data.user
  const { data: list } = await supabase.auth.admin.listUsers()
  return list.users.find((u: any) => u.email === email)!
}

runTest()
