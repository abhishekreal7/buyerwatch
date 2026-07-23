import * as dotenv from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('\n=== ENVIRONMENT CHECK ===')
  const redditApisKey = (process.env.REDDITAPIS_API_KEY || '').trim()
  const clientId = (process.env.REDDIT_CLIENT_ID || '').trim()
  const clientSecret = (process.env.REDDIT_CLIENT_SECRET || '').trim()
  const oauthClientId = (process.env.REDDIT_OAUTH_CLIENT_ID || '').trim()
  const approved = process.env.REDDIT_API_APPROVED

  console.log(`REDDITAPIS_API_KEY: ${redditApisKey ? `SET (${redditApisKey.slice(0,20)}...)` : 'NOT SET'}`)
  console.log(`REDDIT_CLIENT_ID: ${clientId && !clientId.includes('TODO') ? `SET (${clientId.slice(0,10)}...)` : 'NOT SET / TODO'}`)
  console.log(`REDDIT_CLIENT_SECRET: ${clientSecret && !clientSecret.includes('TODO') ? 'SET' : 'NOT SET / TODO'}`)
  console.log(`REDDIT_OAUTH_CLIENT_ID: ${oauthClientId && !oauthClientId.includes('TODO') ? `SET (${oauthClientId.slice(0,10)}...)` : 'NOT SET'}`)
  console.log(`REDDIT_API_APPROVED: ${approved}`)

  console.log('\n=== PLATFORM_CONNECTIONS (Reddit) ===')
  // First fetch with minimal columns to avoid missing column errors
  const { data: connections, error } = await supabase
    .from('platform_connections')
    .select('id, user_id, platform, access_token, refresh_token')
    .eq('platform', 'reddit')

  if (error) {
    console.error('DB error:', error)
    return
  }

  console.log(`Total Reddit OAuth connections found: ${connections?.length ?? 0}`)
  
  if (!connections || connections.length === 0) {
    console.log('\n❌ No Reddit OAuth connections in platform_connections.')
    console.log('   Users have never connected their Reddit accounts via OAuth.')
    console.log('   The OAuth write path has no tokens to use.')
    return
  }

  for (const conn of connections) {
    const hasAccess = !!conn.access_token
    const hasRefresh = !!conn.refresh_token
    console.log(`\nUser ${conn.user_id}:`)
    console.log(`  access_token:  ${hasAccess ? '✅ present (encrypted)' : '❌ missing'}`)
    console.log(`  refresh_token: ${hasRefresh ? '✅ present (encrypted)' : '❌ missing'}`)
  }

  console.log('\n=== SUMMARY ===')
  if (connections.length > 0) {
    const hasAllTokens = tokenData?.every(c => c.access_token && c.refresh_token)
    console.log(`OAuth write path prerequisite (tokens in DB): ${hasAllTokens ? '✅ tokens exist for all connections' : '⚠️ some connections missing tokens'}`)
    console.log(`OAuth write path prerequisite (client credentials): ${clientId && !clientId.includes('TODO') ? '✅' : '❌ REDDIT_CLIENT_ID not set — token refresh will fail'}`)
    
    if (!clientId || clientId.includes('TODO')) {
      console.log('\n⚠️  Even if tokens exist in DB, token REFRESH will fail because')
      console.log('   REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are not configured.')
      console.log('   Tokens expire in ~24h, so a test send might work now on an unexpired token,')
      console.log('   but will break on the next refresh cycle.')
    }
  }
}

main().catch(console.error)
