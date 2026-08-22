import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const client = read('src/lib/sprinklr-client.ts')
const migration = read('supabase/migrations/20260822123000_sprinklr_reddit_provider.sql')
const posting = read('src/lib/reddit-post.ts')
const settingsRoute = read('src/app/api/settings/reddit/route.ts')

describe('Sprinklr Reddit integration architecture', () => {
  it('stores only an encrypted account mapping under service-role access', () => {
    expect(migration).toContain("provider in ('redditapis', 'sprinklr')")
    expect(migration).toContain('session_version in (1, 2)')
    expect(migration).toContain('save_sprinklr_reddit_connection_v1')
    expect(migration).toContain('to service_role')
    expect(migration).not.toMatch(/password\s+text/i)
    expect(settingsRoute).toContain('saveSprinklrRedditConnection')
    expect(settingsRoute).not.toContain('SPRINKLR_ACCESS_TOKEN')
  })

  it('uses Listening for discovery and the Publishing Reply API for delivery', () => {
    expect(client).toContain("'/api/v1/listening/query/stream'")
    expect(client).toContain("'/api/v2/publishing/reply'")
    expect(client).toContain('/api/v2/publishing/posts?postIds=')
    expect(client).toContain('inReplyToMessageId')
    expect(posting).toContain('fetchSprinklrRedditPostSnapshot')
  })

  it('never retries or claims an unverified accepted write', () => {
    expect(client).toContain('sprinklr_delivery_outcome_unknown')
    expect(client).toContain('deliveryUncertain')
    expect(client).toContain('Never retry an ambiguous write')
    expect(client).toContain('findRedditCommentPermalink')
  })
})
