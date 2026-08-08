import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getProviderCapabilities,
  validateAppEnvironment,
  validateWebRuntimeEnvironment,
  validateWorkerEnvironment,
} from '../src/lib/env'

const productionCore = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_APP_URL: 'https://app.example.com',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@example.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  UPSTASH_REDIS_URL: 'rediss://default:password@redis.example.com:6379',
  CRON_SECRET: 'c'.repeat(32),
  ENCRYPTION_KEY: '0'.repeat(64),
  ANTHROPIC_API_KEY: 'anthropic',
}

function stubProductionCore() {
  for (const [name, value] of Object.entries(productionCore)) {
    vi.stubEnv(name, value)
  }
  for (const name of [
    'DODO_PAYMENTS_API_KEY',
    'DODO_PAYMENTS_STARTER_PRODUCT_ID',
    'DODO_PAYMENTS_PRO_PRODUCT_ID',
    'DODO_PAYMENTS_GROWTH_PRODUCT_ID',
    'DODO_PAYMENTS_STARTER_ANNUAL_PRODUCT_ID',
    'DODO_PAYMENTS_PRO_ANNUAL_PRODUCT_ID',
    'DODO_PAYMENTS_GROWTH_ANNUAL_PRODUCT_ID',
    'DODO_PAYMENTS_WEBHOOK_SECRET',
    'DODO_PAYMENTS_ENVIRONMENT',
    'DODO_PAYMENTS_SIGNAL_PACK_PRODUCT_ID',
    'DODO_PAYMENTS_DRAFT_PACK_PRODUCT_ID',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_INTENT_MODEL',
    'REDDIT_CLIENT_ID',
    'REDDIT_CLIENT_SECRET',
    'REDDITAPIS_API_KEY',
    'REDDITAPIS_FALLBACK_ENABLED',
    'REDDITAPIS_POSTING_ENABLED',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
  ]) {
    vi.stubEnv(name, '')
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('production capability configuration', () => {
  it('boots the web runtime without unrelated backend integrations', () => {
    stubProductionCore()
    for (const name of [
      'NEXT_PUBLIC_SUPPORT_EMAIL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'UPSTASH_REDIS_URL',
      'CRON_SECRET',
      'ENCRYPTION_KEY',
      'ANTHROPIC_API_KEY',
    ]) {
      vi.stubEnv(name, '')
    }

    expect(() => validateWebRuntimeEnvironment()).not.toThrow()
  })

  it('requires public Supabase credentials to boot the web runtime', () => {
    stubProductionCore()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')

    expect(() => validateWebRuntimeEnvironment()).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    )
  })

  it('launches with Anthropic while optional providers remain absent', () => {
    stubProductionCore()
    expect(() => validateAppEnvironment()).not.toThrow()
    expect(getProviderCapabilities()).toMatchObject({
      aiDrafting: true,
      billing: false,
      redditPosting: false,
      email: false,
    })
  })

  it('requires Anthropic in production', () => {
    stubProductionCore()
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(() => validateAppEnvironment()).toThrow(/requires ANTHROPIC_API_KEY/)
  })

  it('rejects placeholder Anthropic credentials', () => {
    stubProductionCore()
    vi.stubEnv('ANTHROPIC_API_KEY', '# TODO: add key')
    expect(() => validateAppEnvironment()).toThrow(/requires ANTHROPIC_API_KEY/)
    expect(getProviderCapabilities().aiDrafting).toBe(false)
  })

  it('rejects partially configured optional providers', () => {
    stubProductionCore()
    vi.stubEnv('DODO_PAYMENTS_API_KEY', 'configured')
    expect(() => validateAppEnvironment()).toThrow(/Dodo billing is partially configured/)
  })

  it('enables billing only with every subscription product and an explicit environment', () => {
    stubProductionCore()
    vi.stubEnv('DODO_PAYMENTS_API_KEY', 'configured')
    vi.stubEnv('DODO_PAYMENTS_STARTER_PRODUCT_ID', 'starter')
    vi.stubEnv('DODO_PAYMENTS_PRO_PRODUCT_ID', 'pro')
    vi.stubEnv('DODO_PAYMENTS_GROWTH_PRODUCT_ID', 'growth')
    vi.stubEnv('DODO_PAYMENTS_STARTER_ANNUAL_PRODUCT_ID', 'starter-annual')
    vi.stubEnv('DODO_PAYMENTS_PRO_ANNUAL_PRODUCT_ID', 'pro-annual')
    vi.stubEnv('DODO_PAYMENTS_GROWTH_ANNUAL_PRODUCT_ID', 'growth-annual')
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_SECRET', 'webhook')
    vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', 'test_mode')

    expect(() => validateAppEnvironment()).not.toThrow()
    expect(getProviderCapabilities().billing).toBe(true)
  })

  it('rejects an invalid Dodo environment instead of falling through to live mode', () => {
    stubProductionCore()
    vi.stubEnv('DODO_PAYMENTS_API_KEY', 'configured')
    vi.stubEnv('DODO_PAYMENTS_STARTER_PRODUCT_ID', 'starter')
    vi.stubEnv('DODO_PAYMENTS_PRO_PRODUCT_ID', 'pro')
    vi.stubEnv('DODO_PAYMENTS_GROWTH_PRODUCT_ID', 'growth')
    vi.stubEnv('DODO_PAYMENTS_STARTER_ANNUAL_PRODUCT_ID', 'starter-annual')
    vi.stubEnv('DODO_PAYMENTS_PRO_ANNUAL_PRODUCT_ID', 'pro-annual')
    vi.stubEnv('DODO_PAYMENTS_GROWTH_ANNUAL_PRODUCT_ID', 'growth-annual')
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_SECRET', 'webhook')
    vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', 'production')

    expect(() => validateAppEnvironment()).toThrow(/test_mode or live_mode/)
    expect(getProviderCapabilities().billing).toBe(false)
  })

  it('requires add-on product IDs as a pair', () => {
    stubProductionCore()
    vi.stubEnv('DODO_PAYMENTS_SIGNAL_PACK_PRODUCT_ID', 'signals')

    expect(() => validateAppEnvironment()).toThrow(/Dodo add-on billing is partially configured/)
  })

  it('does not claim unapproved Reddit OAuth can power discovery', () => {
    stubProductionCore()
    vi.stubEnv('REDDIT_CLIENT_ID', 'client-id')
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'client-secret')
    vi.stubEnv('REDDIT_API_APPROVED', 'false')

    expect(getProviderCapabilities().redditDiscovery).toBe(false)
  })

  it('requires a production Reddit provider for the worker', () => {
    stubProductionCore()
    vi.stubEnv('ADMIN_SECRET', 'a'.repeat(32))
    vi.stubEnv('REDDITAPIS_API_KEY', '')
    vi.stubEnv('REDDIT_CLIENT_ID', '')
    vi.stubEnv('REDDIT_CLIENT_SECRET', '')
    vi.stubEnv('REDDIT_API_APPROVED', 'false')

    expect(() => validateWorkerEnvironment()).toThrow(/requires an enabled Reddit proxy/)
  })

  it('does not enable a paid Reddit proxy from its key alone', () => {
    stubProductionCore()
    vi.stubEnv('ADMIN_SECRET', 'a'.repeat(32))
    vi.stubEnv('REDDITAPIS_API_KEY', 'proxy-key')
    vi.stubEnv('REDDITAPIS_FALLBACK_ENABLED', 'false')

    expect(() => validateWorkerEnvironment()).toThrow(/requires an enabled Reddit proxy/)
    expect(getProviderCapabilities().redditDiscovery).toBe(false)
  })

  it('accepts the configured Reddit proxy for the production worker', () => {
    stubProductionCore()
    vi.stubEnv('ADMIN_SECRET', 'a'.repeat(32))
    vi.stubEnv('REDDITAPIS_API_KEY', 'proxy-key')
    vi.stubEnv('REDDITAPIS_FALLBACK_ENABLED', 'true')

    expect(() => validateWorkerEnvironment()).not.toThrow()
    expect(getProviderCapabilities().redditDiscovery).toBe(true)
  })

  it('never treats a discovery proxy key as customer-authorized Reddit posting', () => {
    stubProductionCore()
    vi.stubEnv('REDDITAPIS_API_KEY', 'proxy-key')
    vi.stubEnv('REDDITAPIS_FALLBACK_ENABLED', 'true')

    expect(getProviderCapabilities().redditDiscovery).toBe(true)
    expect(getProviderCapabilities().redditPosting).toBe(false)
  })

  it('enables Reddit posting only with the RedditAPIs key and explicit kill switch', () => {
    stubProductionCore()
    vi.stubEnv('REDDITAPIS_API_KEY', 'provider-key')
    vi.stubEnv('REDDITAPIS_POSTING_ENABLED', 'false')
    expect(getProviderCapabilities().redditPosting).toBe(false)

    vi.stubEnv('REDDITAPIS_POSTING_ENABLED', 'true')
    expect(getProviderCapabilities().redditPosting).toBe(true)
  })
})
