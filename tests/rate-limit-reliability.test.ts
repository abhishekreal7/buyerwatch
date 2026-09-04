import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('rate-limit reliability', () => {
  const rateLimits = source('src/lib/ratelimit.ts')
  const environment = source('src/lib/env.ts')

  it('requires Redis for the production web runtime and fails sensitive limiters closed', () => {
    expect(environment).toMatch(/const WEB_RUNTIME_ENV = \[[\s\S]*?'UPSTASH_REDIS_URL'/)
    expect(rateLimits).toContain("options.sensitive && process.env.NODE_ENV === 'production'")
    expect(rateLimits).toContain('return new UnavailableLimiter()')
  })

  it('keeps fallback windows aligned and cleans expired memory keys', () => {
    expect(rateLimits).toContain("searchRateLimit = createLimiter(60, '1 m', 60_000)")
    expect(rateLimits).toContain('this.entries.delete(entryKey)')
  })
})
