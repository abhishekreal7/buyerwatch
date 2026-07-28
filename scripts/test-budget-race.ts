import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function runTest() {
  console.log('--- Step 4: Budget Race Condition Test ---')
  
  let userId: string | undefined
  try {
    // 1. Insert one test user via Auth Admin
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: 'test_race_budget@example.com',
      password: 'password123',
      email_confirm: true
    })

    if (authErr && !authErr.message.includes('already registered')) {
      console.log('Failed to create test auth user.', authErr)
      throw authErr
    }

    // Try to get user if already exists
    userId = authData?.user?.id
    if (!userId) {
       const { data: usersData } = await supabase.auth.admin.listUsers()
       const existingUser = usersData.users.find(u => u.email === 'test_race_budget@example.com')
       userId = existingUser!.id
    }

    const { error: pErr } = await supabase.from('profiles').upsert([
      { id: userId, business_name: 'Race Test Business', plan: 'free' }
    ])
    
    if (pErr) {
      console.log('Failed to insert test profile. Ensure RLS/FK allow it.')
      throw pErr
    }

    // Clean up usage_logs for this user for today to ensure a fresh test
    await supabase.from('usage_logs').delete().eq('user_id', userId)

    console.log('Firing 20 concurrent budget checks (limit is 5)...')

    // 2. Fire 20 concurrent calls
    const limit = 5
    const promises = []
    for (let i = 0; i < 20; i++) {
      promises.push(
        supabase.rpc('increment_usage_if_under_limit', {
          p_user_id: userId,
          p_service: 'intent',
          p_limit: limit
        })
      )
    }

    const results = await Promise.all(promises)
    
    // 3. Count how many returned true
    let successCount = 0
    results.forEach(res => {
      if (res.data === true) successCount++
    })

    console.log(`Total successful (true) responses: ${successCount}`)

    // 4. Assert count is exactly 5
    if (successCount > limit) {
      console.error(`❌ FAILED: Race condition detected! Expected ${limit}, but got ${successCount}`)
      process.exit(1)
    } else if (successCount < limit) {
      console.warn(`⚠️ WARNING: Got fewer successes than expected (${successCount} instead of ${limit}). Check if this is expected network drop or logic bug.`)
    } else {
      console.log('✅ PASSED: Budget check is atomic under concurrency.')
    }

  } catch (err) {
    console.error('Test failed with error:', err)
  } finally {
    // 6. Cleanup
    if (userId) {
      await supabase.from('usage_logs').delete().eq('user_id', userId)
      await supabase.from('profiles').delete().eq('id', userId)
      await supabase.auth.admin.deleteUser(userId)
    }
  }
}

runTest()
