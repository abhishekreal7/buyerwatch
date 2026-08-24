import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strictContentSecurityPolicy } from '../src/lib/session-csp'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('public pricing and session security regressions', () => {
  it('advertises real annual billing without a seven-month trial', () => {
    const homepage = source('src/app/page.tsx')
    const pricing = source('src/app/pricing/PricingClient.tsx')
    expect(`${homepage}\n${pricing}`).not.toMatch(/7-month/i)
    expect(homepage).toMatch(/Save 20%\+/i)
    expect(pricing).toMatch(/Billed.*once per year/i)
    expect(`${homepage}\n${pricing}`).toContain('billing=annual')
  })

  it('keeps the public Starter pricing and trial promise aligned with checkout', () => {
    const checkout = source('src/app/api/billing/checkout/route.ts')
    const pricing = source('src/lib/pricing-plans.ts')
    const homepage = source('src/app/page.tsx')
    const footer = source('src/components/landing/LandingFooter.tsx')

    expect(checkout).toContain('trial_period_days: getTrialDaysForPlan(requestedPlan)')
    expect(pricing).toContain("price: '$39'")
    expect(pricing).toContain("cta: 'Start 7-day free trial'")
    expect(homepage).toContain('7-day free trial on Starter')
    expect(homepage).not.toContain('$19/month')
    expect(footer).toContain('Starter is $39/month after a 7-day free trial')
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
    expect(source('src/app/layout.tsx')).toContain("await headers()")
    expect(source('src/proxy.ts')).toContain("response.headers.set('Content-Security-Policy', contentSecurityPolicy)")
    for (const route of ['login', 'signup', 'forgot-password', 'reset-password']) {
      expect(source(`src/app/${route}/layout.tsx`)).toContain('await headers()')
    }
  })
})
