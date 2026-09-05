import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('conversation search scale', () => {
  const route = source('src/app/api/conversations/search/route.ts')
  const migration = source('supabase/migrations/20260824123000_paginated_conversation_search.sql')

  it('uses indexed database search with a hard response cap and cursor', () => {
    expect(route).toContain('const MAX_RESULTS = 50')
    expect(route).toContain("supabase.rpc('search_monitored_threads_v1'")
    expect(route).toContain('nextCursor:')
    expect(route).not.toContain('for (let offset = 0;')
    expect(migration).toContain('using gin')
    expect(migration).toContain("limit least(greatest(p_limit, 1), 50)")
  })
})
