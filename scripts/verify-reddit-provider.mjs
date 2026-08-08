import path from 'node:path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const providerKey = process.env.REDDITAPIS_API_KEY?.trim()
const postingEnabled = process.env.REDDITAPIS_POSTING_ENABLED === 'true'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exitCode = 1
}

async function checkProvider() {
  if (!providerKey) {
    fail('REDDITAPIS_API_KEY is missing')
    return
  }
  if (!postingEnabled) {
    fail('REDDITAPIS_POSTING_ENABLED is not true')
    return
  }

  const response = await fetch('https://api.redditapis.com/account/me', {
    headers: { Authorization: `Bearer ${providerKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(5_000),
  })
  const payload = await response.json().catch(() => null)
  const credits = Number(payload?.credits_remaining)
  if (!response.ok || !Number.isFinite(credits)) {
    fail(`RedditAPIs account check failed with HTTP ${response.status}`)
    return
  }
  if (credits < 0.02) {
    fail('RedditAPIs balance is below the minimum needed for one fully gated reply')
    return
  }
  console.log('PASS: RedditAPIs key is valid and has delivery credit')
}

async function checkDatabase() {
  if (!supabaseUrl || !serviceRoleKey) {
    fail('Supabase service-role configuration is missing')
    return
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase
    .from('reddit_connection_secrets')
    .select('status')
    .limit(10_000)
  if (error) {
    fail('reddit_connection_secrets is unavailable; apply the direct-delivery migration')
    return
  }
  const counts = { active: 0, reauth_required: 0, error: 0 }
  for (const row of data ?? []) {
    if (row.status in counts) counts[row.status] += 1
  }
  console.log(`PASS: encrypted Reddit session store is available (${counts.active} active, ${counts.reauth_required} reconnect, ${counts.error} error)`)
}

await Promise.all([checkProvider(), checkDatabase()])
if (!process.exitCode) console.log('PASS: Reddit direct-delivery prerequisites are healthy')
