import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderCapabilities, validateAppEnvironment } from '../src/lib/env'

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
  GEMINI_API_KEY: 'gemini',
}

function stubProductionCore() {
  for (const [name, value] of Object.entries(productionCore)) {
    vi.stubEnv(name, value)
  }
  for (const name of [
    'DODO_PAYMENTS_API_KEY',
    'DODO_PAYMENTS_PRO_PRODUCT_ID',
    'DODO_PAYMENTS_GROWTH_PRODUCT_ID',
    'DODO_PAYMENTS_WEBHOOK_SECRET',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'REDDIT_OAUTH_CLIENT_ID',
    'REDDIT_OAUTH_SECRET',
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
  it('launches with Gemini while future providers remain absent', () => {
    stubProductionCore()
    expect(() => validateAppEnvironment()).not.toThrow()
    expect(getProviderCapabilities()).toMatchObject({
      aiDrafting: true,
      billing: false,
      redditPosting: false,
      email: false,
    })
  })

  it('rejects partially configured optional providers', () => {
    stubProductionCore()
    vi.stubEnv('DODO_PAYMENTS_API_KEY', 'configured')
    expect(() => validateAppEnvironment()).toThrow(/Dodo billing is partially configured/)
  })
})
