import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('X token refresh reliability', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/x-post.ts'), 'utf8')

  it('serializes refreshes and refuses an unpersisted rotated token', () => {
    expect(source).toContain('withRedisLock(')
    expect(source).toContain('`locks:x-token-refresh:${userId}`')
    expect(source).toContain(".eq('refresh_token', storedRefreshToken)")
    expect(source).toContain('if (persistError || !persisted)')
    expect(source).toContain("'token_refresh_persist_failed'")
  })
})
