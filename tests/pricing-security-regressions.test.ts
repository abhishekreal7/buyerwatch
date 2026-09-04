import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strictContentSecurityPolicy } from '../src/lib/session-csp'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const landingSource = () => [
  'src/app/page.tsx',
  'src/components/landing/v2/LandingNavbar.tsx',
  'src/components/landing/v2/HeroSection.tsx',
  'src/components/landing/v2/AILeadQualificationSection.tsx',
  'src/components/landing/v2/PricingSection.tsx',
].map(source).join('\n')

describe('public pricing and session security regressions', () => {
  it('advertises real annual billing without a seven-month trial', () => {
    const homepage = landingSource()
    const pricing = source('src/app/pricing/PricingClient.tsx')
    expect(`${homepage}\n${pricing}`).not.toMatch(/7-month/i)
    expect(homepage).toMatch(/Save 20%\+/i)
    expect(pricing).toMatch(/Billed.*once per year/i)
    expect(`${homepage}\n${pricing}`).toContain('billing=annual')
  })

  it('keeps the public Starter introductory price aligned with checkout', () => {
    const checkout = source('src/app/api/billing/checkout/route.ts')
    const pricing = source('src/lib/pricing-plans.ts')
    const homepage = landingSource()
    const footer = source('src/components/landing/LandingFooter.tsx')

    expect(checkout).toContain('trial_period_days: getTrialDaysForPlan(requestedPlan, requestedCadence)')
    expect(checkout).toContain('discount_code: starterPromotionCode ?? null')
    expect(checkout).toContain('allow_discount_code: Boolean(starterPromotionCode)')
    expect(pricing).toContain("price: '$39'")
    expect(pricing).toContain("cta: 'Start for $19'")
    expect(homepage).toContain('Limited-time offer')
    expect(homepage).toContain('STARTER_PROMOTION.introductoryMonthlyPriceUsd')
    expect(homepage).toContain('then $${monthlyPrice}/month')
    expect(homepage).toContain('7-day free trial')
    expect(homepage).not.toMatch(/launch offer/i)
    expect(footer).toContain('card-required 7-day trial and one Instant Autopilot send')
    expect(footer).toContain('first paid month is $19, then $39/month')
    expect(footer).toContain('Annual billing starts after the trial')
  })

  it('keeps the how-it-works anchor valid', () => {
    const homepage = landingSource()
    expect(homepage).toContain('href="#how-it-works"')
    expect(homepage).toContain('id="how-it-works"')
    expect(homepage).not.toContain('#how-it works')
  })

  it('keeps the fixed landing navigation smooth while scrolling', () => {
    const navbar = source('src/components/landing/v2/LandingNavbar.tsx')
    const styles = source('src/components/landing/v2/landing.module.css')

    expect(navbar).toContain('window.requestAnimationFrame(updateNavigation)')
    expect(navbar).toContain('window.cancelAnimationFrame(animationFrame)')
    expect(styles).not.toContain('transition: .25s ease')
    expect(styles).not.toContain('backdrop-filter: blur(18px)')
  })

  it('uses nonce-based strict script CSP without a conflicting global CSP', () => {
    const policy = strictContentSecurityPolicy('test-nonce')
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    expect(source('next.config.ts')).not.toContain("{ key: 'Content-Security-Policy'")
    expect(source('src/app/layout.tsx')).toContain("await headers()")
    expect(source('src/app/loading.tsx')).toContain("from '@/components/BrandLogo'")
    expect(source('src/proxy.ts')).toContain("response.headers.set('Content-Security-Policy', contentSecurityPolicy)")
    for (const route of ['login', 'signup', 'forgot-password', 'reset-password']) {
      expect(source(`src/app/${route}/layout.tsx`)).toContain('await headers()')
    }
  })

  it('serves the selected static homepage at the public root', () => {
    const config = source('next.config.ts')
    expect(config).toContain("source: '/'")
    expect(config).toContain("destination: '/homepage-prototype/index.html'")
    expect(config).toContain('beforeFiles')
    expect(source('src/proxy.ts')).toContain('staticHomepageContentSecurityPolicy')
  })

  it('never advertises a zero-price plan and limits the trial to Starter', () => {
    const layout = source('src/app/layout.tsx')
    const pricing = source('src/app/pricing/PricingClient.tsx')
    const plans = source('src/lib/pricing-plans.ts')
    expect(layout).not.toContain("category: 'Free plan'")
    expect(layout).not.toContain("price: '0'")
    expect(pricing).not.toContain('forever')
    expect(plans.match(/Card-required 7-day free trial/g)).toHaveLength(1)
  })

  it('opens checkout directly for authenticated visitors instead of sending them through signup again', () => {
    const pricingClient = source('src/app/pricing/PricingClient.tsx')
    const pricingPage = source('src/app/pricing/page.tsx')

    expect(pricingPage).toContain('isAuthenticated={Boolean(userId)}')
    expect(pricingClient).toContain("fetch('/api/billing/checkout'")
    expect(pricingClient).toContain('isAuthenticated && checkoutAvailable && !isCurrentPlan')
    expect(pricingClient).toContain("credentials: 'same-origin'")
  })
})
