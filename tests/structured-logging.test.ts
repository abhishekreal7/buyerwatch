import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('structured redacting server logs', () => {
  it.each([
    'src/app/api/billing/checkout/route.ts',
    'src/app/api/replies/generate/route.ts',
    'src/app/auth/callback/route.ts',
  ])('does not bypass the logger in %s', path => {
    const content = source(path)
    expect(content).not.toContain('console.error')
    expect(content).toContain("from '@/lib/logger'")
  })

  it('never logs raw OAuth query error text', () => {
    const callback = source('src/app/auth/callback/route.ts')
    expect(callback).not.toMatch(/logger\.[a-z]+\([^)]*oauthError/)
    expect(callback).toContain("code: 'oauth_provider_rejected'")
  })
})
