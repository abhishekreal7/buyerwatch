import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strictContentSecurityPolicy } from '../src/lib/session-csp'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('public pricing and session security regressions', () => {
  it('does not advertise unsupported annual billing or a seven-month trial', () => {
    const homepage = source('src/app/page.tsx')
    const pricing = source('src/app/pricing/PricingClient.tsx')
    expect(`${homepage}\n${pricing}`).not.toMatch(/7-month|billed annually|Save 20%/i)
  })

  it('keeps the how-it-works anchor valid', () => {
    const homepage = source('src/app/page.tsx')
    expect(homepage).toContain('href="#how-it-works"')
    expect(homepage).toContain('id="how-it-works"')
    expect(homepage).not.toContain('#how-it works')
  })

  it('uses nonce-based strict script CSP without a conflicting global CSP', () => {
    const policy = strictContentSecurityPolicy('test-nonce')
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    expect(source('next.config.ts')).not.toContain("{ key: 'Content-Security-Policy'")
    for (const route of ['login', 'signup', 'forgot-password', 'reset-password']) {
      expect(source(`src/app/${route}/layout.tsx`)).toContain('await headers()')
    }
  })
})
