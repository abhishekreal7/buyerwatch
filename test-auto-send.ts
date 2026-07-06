import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function runTests() {
  console.log('--- Running Tests ---')
  const { checkSendRateLimit } = await import('./src/lib/send-limiter')
  const { redis } = await import('./src/lib/redis')
  
  const testUserId = 'test-user-rate-limit'
  const platform = 'reddit'
  const currentHour = Math.floor(Date.now() / 3600000)
  const hourKey = `post-count:${testUserId}:${platform}:${currentHour}`
  const gapKey = `last-post:${testUserId}:${platform}`

  // Ensure clean state
  if (redis) {
    await redis.del(hourKey)
    await redis.del(gapKey)
  }

  console.log('\n[Case D] Testing Rate Limiting (Minimum Gap vs Hourly Cap)')
  
  // 1st Post: Should succeed
  let res = await checkSendRateLimit(testUserId, platform)
  console.log(`Post 1 (Initial): allowed=${res.allowed}, reason=${res.reason}`)

  // 2nd Post immediately: Should fail due to GAP (Reddit gap is 5 minutes)
  res = await checkSendRateLimit(testUserId, platform)
  console.log(`Post 2 (Immediate): allowed=${res.allowed}, reason=${res.reason}`)
  
  if (res.allowed) {
    console.error('❌ Failed: 2nd post should be blocked by minimum gap.')
  } else if (!res.reason?.includes('Posting too fast')) {
    console.error('❌ Failed: 2nd post blocked, but wrong reason:', res.reason)
  } else {
    console.log('✅ 2nd post correctly blocked by minimum gap')
  }

  // Simulate time passing (clear the gap key to pretend 5 minutes passed)
  if (redis) {
    await redis.del(gapKey)
    console.log('\n(Simulated 5 minutes passing...)')
  }

  // 3rd Post (Wait 5 min): Should succeed (Count = 2 now)
  res = await checkSendRateLimit(testUserId, platform)
  console.log(`Post 3 (After 5 min): allowed=${res.allowed}, reason=${res.reason}`)

  // Simulate time passing again
  if (redis) {
    await redis.del(gapKey)
    console.log('\n(Simulated another 5 minutes passing...)')
  }

  // 4th Post (Wait 5 min): Should succeed (Count = 3 now, hits hourly cap)
  res = await checkSendRateLimit(testUserId, platform)
  console.log(`Post 4 (After another 5 min): allowed=${res.allowed}, reason=${res.reason}`)

  // Simulate time passing again
  if (redis) {
    await redis.del(gapKey)
    console.log('\n(Simulated another 5 minutes passing...)')
  }

  // 5th Post (Wait 5 min): Should fail due to HOURLY CAP (Reddit limit is 3/hr)
  res = await checkSendRateLimit(testUserId, platform)
  console.log(`Post 5 (After another 5 min): allowed=${res.allowed}, reason=${res.reason}`)
  
  if (res.allowed) {
    console.error('❌ Failed: 5th post should be blocked by hourly limit.')
  } else if (!res.reason?.includes('Hourly posting limit reached')) {
    console.error('❌ Failed: 5th post blocked, but wrong reason:', res.reason)
  } else {
    console.log('✅ 5th post correctly blocked by hourly limit')
  }

  if (redis) {
    console.log('\n[Case F] Testing Elapsed Time Branch Directly')
    const caseFUserId = 'test-user-gap-branch'
    const caseFGapKey = `last-post:${caseFUserId}:${platform}`

    // 1. Simulate a post that happened 305 seconds ago (5 seconds past the 300s Reddit minimum gap)
    await redis.set(caseFGapKey, (Date.now() - 305_000).toString())
    let resF = await checkSendRateLimit(caseFUserId, platform)
    console.log('Case F (elapsed time, just past gap):', resF)

    // 2. Simulate a post 100 seconds ago (still within the 300s gap)
    await redis.set(caseFGapKey, (Date.now() - 100_000).toString())
    let resF2 = await checkSendRateLimit(caseFUserId, platform)
    
    // We expect { allowed: false, reset: Date.now() + 200_000 } approx
    let retryAfterSeconds = Math.round(((resF2.reset || 0) - Date.now()) / 1000)
    console.log('Case F (elapsed time, still within gap):', {
      allowed: resF2.allowed,
      reason: resF2.reason,
      retryAfterSeconds
    })

    // Clean up
    await redis.del(caseFGapKey)
    await redis.del(`post-count:${caseFUserId}:${platform}:${currentHour}`)
  }

  if (redis) {
    await redis.quit() // close connection to allow process to exit
  }
  
  process.exit(0)
}

runTests().catch(console.error)
