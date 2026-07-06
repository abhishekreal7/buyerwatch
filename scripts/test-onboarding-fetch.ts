import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testOnboarding() {
  console.log('1. Creating fresh test user...')
  const email = `test-onboarding-${Date.now()}@example.com`
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true
  })
  
  if (authError || !authData.user) {
    console.error('Failed to create user:', authError)
    return
  }
  const userId = authData.user.id
  console.log('Created user:', userId)

  await supabase.from('profiles').insert({
    id: userId,
    business_name: 'Test Business',
    business_type: 'b2b_saas',
    business_description: 'We do marketing',
    plan: 'free',
  })

  console.log('2. Inserting test keyword (r/Entrepreneur)...')
  const { data: keywordData, error: keywordError } = await supabase
    .from('keywords')
    .insert({
      user_id: userId,
      platform: 'reddit',
      target: 'Entrepreneur',
      term: 'marketing',
      is_active: true
    })
    .select()
    .single()

  if (keywordError) {
    console.error('Failed to insert keyword:', keywordError)
    return
  }
  const keywordId = keywordData.id
  console.log('Inserted keyword:', keywordId)

  console.log('3. Triggering API fetch-now directly...')
  const res = await fetch('http://localhost:3000/api/keywords/fetch-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywordId })
  })

  if (!res.ok) {
    console.error('Failed to trigger fetch-now:', await res.text())
    return
  }
  console.log('Triggered fetch-now.')

  console.log('4. Waiting 10 seconds for worker pipeline (fetch -> score)...')
  await new Promise(r => setTimeout(r, 10000))

  console.log('5. Querying monitored_threads for this user...')
  const { data: threads, error: threadsError } = await supabase
    .from('monitored_threads')
    .select('*')
    .eq('user_id', userId)

  if (threadsError) {
    console.error('Failed to query threads:', threadsError)
    return
  }

  console.log(`Found ${threads.length} threads for user ${userId}.`)
  if (threads.length > 0) {
    console.log('Sample thread:', threads[0])
  } else {
    console.log('No threads found. The audit finding might have been right, or there are no matches.')
  }
}

testOnboarding().catch(console.error)
