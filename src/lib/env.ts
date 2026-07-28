const CORE_PRODUCTION_ENV = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPPORT_EMAIL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_URL',
  'CRON_SECRET',
  'ENCRYPTION_KEY',
] as const

const WORKER_PRODUCTION_ENV = [
  ...CORE_PRODUCTION_ENV,
  'ADMIN_SECRET',
] as const

function assertValues(names: readonly string[], scope: string): void {
  const missing = names.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) {
    throw new Error(`${scope} is missing required environment variables: ${missing.join(', ')}`)
  }

  if (
    process.env.NEXT_PUBLIC_APP_URL &&
    !process.env.NEXT_PUBLIC_APP_URL.startsWith('https://')
  ) {
    throw new Error(`${scope} requires NEXT_PUBLIC_APP_URL to use HTTPS`)
  }

  if (process.env.ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
    throw new Error(`${scope} requires ENCRYPTION_KEY to be 64 hexadecimal characters`)
  }

  for (const secretName of ['CRON_SECRET', 'ADMIN_SECRET'] as const) {
    const value = process.env[secretName]
    if (value && value.length < 32) {
      throw new Error(`${scope} requires ${secretName} to be at least 32 characters`)
    }
  }
}

function assertCompleteOptionalGroup(names: readonly string[], label: string): void {
  const configured = names.filter((name) => process.env[name]?.trim())
  if (configured.length > 0 && configured.length !== names.length) {
    const missing = names.filter((name) => !process.env[name]?.trim())
    throw new Error(`${label} is partially configured; missing: ${missing.join(', ')}`)
  }
}

export function getConfiguredSecret(value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (
    !trimmed
    || trimmed.startsWith('#')
    || trimmed.toLocaleLowerCase().includes('todo')
    || trimmed.toLocaleLowerCase().includes('placeholder')
  ) {
    return ''
  }
  return trimmed
}

export interface ProviderCapabilities {
  aiDrafting: boolean
  billing: boolean
  redditDiscovery: boolean
  redditPosting: boolean
  bluesky: boolean
  x: boolean
  email: boolean
  sentry: boolean
}

export function getProviderCapabilities(): ProviderCapabilities {
  return {
    aiDrafting: Boolean(getConfiguredSecret(process.env.ANTHROPIC_API_KEY)),
    billing: Boolean(
      process.env.DODO_PAYMENTS_API_KEY
      && process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
      && process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID
      && process.env.DODO_PAYMENTS_WEBHOOK_SECRET
    ),
    redditDiscovery: Boolean(
      process.env.REDDITAPIS_API_KEY
      || (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET)
    ),
    redditPosting: Boolean(
      process.env.REDDIT_OAUTH_CLIENT_ID
      && process.env.REDDIT_OAUTH_SECRET
    ),
    bluesky: Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD),
    x: Boolean(
      process.env.X_API_KEY
      && process.env.X_API_SECRET
      && process.env.X_ACCESS_TOKEN
      && process.env.X_ACCESS_SECRET
    ),
    email: Boolean(process.env.RESEND_API_KEY),
    sentry: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  }
}

function validateOptionalProviders(): void {
  assertCompleteOptionalGroup([
    'DODO_PAYMENTS_API_KEY',
    'DODO_PAYMENTS_PRO_PRODUCT_ID',
    'DODO_PAYMENTS_GROWTH_PRODUCT_ID',
    'DODO_PAYMENTS_WEBHOOK_SECRET',
  ], 'Dodo billing')
  assertCompleteOptionalGroup([
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
  ], 'Resend email')
  assertCompleteOptionalGroup([
    'REDDIT_OAUTH_CLIENT_ID',
    'REDDIT_OAUTH_SECRET',
  ], 'Reddit OAuth posting')
  assertCompleteOptionalGroup([
    'BLUESKY_HANDLE',
    'BLUESKY_APP_PASSWORD',
  ], 'Bluesky')
  assertCompleteOptionalGroup([
    'X_API_KEY',
    'X_API_SECRET',
    'X_ACCESS_TOKEN',
    'X_ACCESS_SECRET',
  ], 'X')
}

export function validateAppEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return
  assertValues(CORE_PRODUCTION_ENV, 'BuyerWatch app')
  validateOptionalProviders()
  if (!getConfiguredSecret(process.env.ANTHROPIC_API_KEY)) {
    throw new Error('BuyerWatch app requires ANTHROPIC_API_KEY')
  }
}

export function validateWorkerEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return
  assertValues(WORKER_PRODUCTION_ENV, 'BuyerWatch worker')
  validateOptionalProviders()
  if (!getConfiguredSecret(process.env.ANTHROPIC_API_KEY)) {
    throw new Error('BuyerWatch worker requires ANTHROPIC_API_KEY')
  }
}

export function isDevelopmentMockEnabled(
  name: 'USE_MOCK_BLUESKY' | 'USE_MOCK_DRAFTS' | 'USE_MOCK_X',
): boolean {
  return process.env.NODE_ENV !== 'production' && process.env[name] === 'true'
}
