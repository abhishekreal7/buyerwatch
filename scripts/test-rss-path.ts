import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { fetchSubredditNew } from '../src/lib/reddit'

async function main() {
  console.log('\n=== RSS LIVE TEST ===')
  console.log('Testing fetchSubredditNew with RSS as primary path...\n')

  // Temporarily clear the redditapis key so we exercise the RSS path exclusively
  const originalKey = process.env.REDDITAPIS_API_KEY
  process.env.REDDITAPIS_API_KEY = ''

  for (const subreddit of ['Entrepreneur', 'SaaS', 'marketing']) {
    try {
      console.log(`\n--- r/${subreddit} ---`)
      const posts = await fetchSubredditNew(subreddit, 5)
      console.log(`✅ Got ${posts.length} posts`)
      if (posts.length > 0) {
        const p = posts[0]
        console.log(`   First post:`)
        console.log(`   externalId : ${p.externalId}`)
        console.log(`   author     : ${p.author}`)
        console.log(`   url        : ${p.url}`)
        console.log(`   createdAt  : ${p.createdAt}`)
        console.log(`   text (80c) : ${p.text.slice(0, 80).replace(/\n/g, ' ')}...`)
        
        // Validate all required fields are populated
        const missing = []
        if (!p.externalId) missing.push('externalId')
        if (!p.author) missing.push('author')
        if (!p.text) missing.push('text')
        if (!p.url) missing.push('url')
        if (!p.createdAt) missing.push('createdAt')
        if (!p.platform) missing.push('platform')
        if (!p.sourceTarget) missing.push('sourceTarget')
        
        if (missing.length > 0) {
          console.log(`   ⚠️  Missing fields: ${missing.join(', ')}`)
        } else {
          console.log(`   ✅ All NormalizedPost fields populated`)
        }
      }
    } catch (err) {
      console.error(`❌ Failed for r/${subreddit}:`, err)
    }
  }

  // Restore
  process.env.REDDITAPIS_API_KEY = originalKey
  console.log('\n=== TEST COMPLETE ===')
}

main().catch(console.error)
