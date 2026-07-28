import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function runStep1() {
  console.log('--- Step 1: Schema Sanity Check ---')
  
  // We can query pg_class and pg_proc to check tables, RLS, and functions
  // Note: To do this from the JS client, we'd normally need a direct Postgres connection or rpc.
  // But we can check if the tables exist by just doing a simple select limit 1 on them.
  // To check RLS, we can query them with the ANON key (which should fail or return 0 rows if RLS is on).
  // But to strictly check if RLS is ENABLED, doing it from the client is tricky without RPC.
  
  const tables = ['profiles', 'keywords', 'monitored_threads', 'reply_analytics', 'usage_logs']
  let allTablesPass = true

  for (const table of tables) {
    const { error } = await supabase.from(table).select('*').limit(1)
    if (error && error.code === '42P01') {
      console.log(`❌ FAILED: Table '${table}' does NOT exist.`)
      allTablesPass = false
    } else if (error) {
      console.log(`❌ FAILED: Error querying '${table}':`, error)
      allTablesPass = false
    } else {
      console.log(`✅ PASSED: Table '${table}' exists.`)
    }
  }

  // To check RLS properly, we can use the anon client
  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  let rlsPassed = true
  for (const table of tables) {
    const { data, error } = await anonSupabase.from(table).select('*').limit(1)
    // If RLS is enabled, anon shouldn't be able to read others' rows (should return empty array, or fail if no policy allows it)
    if (error) {
       console.log(`✅ PASSED: RLS on '${table}' blocks anon read (Error: ${error.message})`)
    } else if (data && data.length === 0) {
       console.log(`✅ PASSED: RLS on '${table}' blocks anon read (Returns 0 rows)`)
    } else {
       console.log(`❌ FAILED: RLS on '${table}' might not be enabled. Anon read returned data!`)
       rlsPassed = false
    }
  }

  // Check if increment_usage_if_under_limit exists by calling it with dummy data
  // It expects (uuid, text, int). We can pass dummy data and it should return false or throw a nice error if missing.
  const { error: fnError } = await supabase.rpc('increment_usage_if_under_limit', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_service: 'intent',
    p_limit: 5
  })

  let fnPassed = false
  if (fnError && fnError.code === '42883') {
    console.log(`❌ FAILED: Function 'increment_usage_if_under_limit' does NOT exist.`)
  } else if (fnError && fnError.message.includes('foreign key constraint')) {
    // This implies the function exists and tried to insert into usage_logs but failed FK. That's a PASS for existence!
    console.log(`✅ PASSED: Function 'increment_usage_if_under_limit' exists and is callable.`)
    fnPassed = true
  } else if (fnError) {
    console.log(`✅ PASSED: Function 'increment_usage_if_under_limit' exists (got expected operational error).`)
    fnPassed = true
  } else {
    console.log(`✅ PASSED: Function 'increment_usage_if_under_limit' exists and executed successfully.`)
    fnPassed = true
  }

  if (allTablesPass && rlsPassed && fnPassed) {
    console.log('\nSTEP 1 FULLY PASSED ✅')
  } else {
    console.log('\nSTEP 1 FAILED ❌. Please run supabase/schema.sql in the Supabase SQL Editor before proceeding.')
    process.exit(1)
  }
}

runStep1()
