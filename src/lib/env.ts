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

const WEB_RUNTIME_ENV = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
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

function assertOptionalInteger(
  name: string,
  minimum: number,
  maximum: number,
): void {
  const raw = process.env[name]?.trim()
  if (!raw) return
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`)
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

export function hasRedditDiscoveryProvider(): boolean {
  return process.env.REDDITAPIS_FALLBACK_ENABLED === 'true'
    && Boolean(getConfiguredSecret(process.env.REDDITAPIS_API_KEY))
}

/** Reddit writes require both the provider key and an explicit kill switch. */
export function hasRedditPostingProvider(): boolean {
  return process.env.REDDITAPIS_POSTING_ENABLED === 'true'
    && Boolean(getConfiguredSecret(process.env.REDDITAPIS_API_KEY))
}

export function getProviderCapabilities(): ProviderCapabilities {
  return {
    aiDrafting: Boolean(getConfiguredSecret(process.env.ANTHROPIC_API_KEY)),
    billing: Boolean(
      process.env.DODO_PAYMENTS_API_KEY
      && process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID
      && process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
      && process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID
      && process.env.DODO_PAYMENTS_STARTER_ANNUAL_PRODUCT_ID
      && process.env.DODO_PAYMENTS_PRO_ANNUAL_PRODUCT_ID
      && process.env.DODO_PAYMENTS_GROWTH_ANNUAL_PRODUCT_ID
      && process.env.DODO_PAYMENTS_WEBHOOK_SECRET
      && (
        process.env.DODO_PAYMENTS_ENVIRONMENT === 'test_mode'
        || process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode'
      )
    ),
    redditDiscovery: hasRedditDiscoveryProvider(),
    redditPosting: hasRedditPostingProvider(),
    // Public Bluesky discovery is keyless. Credentials are only needed when a
    // user connects their own account for posting.
    bluesky: true,
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
    'DODO_PAYMENTS_STARTER_PRODUCT_ID',
    'DODO_PAYMENTS_PRO_PRODUCT_ID',
    'DODO_PAYMENTS_GROWTH_PRODUCT_ID',
    'DODO_PAYMENTS_STARTER_ANNUAL_PRODUCT_ID',
    'DODO_PAYMENTS_PRO_ANNUAL_PRODUCT_ID',
    'DODO_PAYMENTS_GROWTH_ANNUAL_PRODUCT_ID',
    'DODO_PAYMENTS_WEBHOOK_SECRET',
    'DODO_PAYMENTS_ENVIRONMENT',
  ], 'Dodo billing')
  if (
    process.env.DODO_PAYMENTS_API_KEY
    && process.env.DODO_PAYMENTS_ENVIRONMENT !== 'test_mode'
    && process.env.DODO_PAYMENTS_ENVIRONMENT !== 'live_mode'
  ) {
    throw new Error('DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode')
  }
  assertCompleteOptionalGroup([
    'DODO_PAYMENTS_SIGNAL_PACK_PRODUCT_ID',
    'DODO_PAYMENTS_DRAFT_PACK_PRODUCT_ID',
  ], 'Dodo add-on billing')
  assertCompleteOptionalGroup([
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
  ], 'Resend email')
  if (
    process.env.REDDITAPIS_POSTING_ENABLED === 'true'
    && !getConfiguredSecret(process.env.REDDITAPIS_API_KEY)
  ) {
    throw new Error('RedditAPIs posting is enabled but REDDITAPIS_API_KEY is missing')
  }
  assertOptionalInteger('REDDITAPIS_MAX_DAILY_READ_CALLS', 0, 100_000)
  assertOptionalInteger('REDDITAPIS_MAX_DAILY_WRITE_CALLS', 0, 100_000)
  assertOptionalInteger('REDDITAPIS_DISCOVERY_CACHE_SECONDS', 300, 1_800)
  assertOptionalInteger('REDDIT_AUTO_MIN_ACCOUNT_AGE_DAYS', 7, 365)
  assertOptionalInteger('REDDIT_AUTO_MIN_COMBINED_KARMA', 0, 100_000)
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

/**
 * Validate only the configuration required to boot the Next.js request runtime.
 *
 * Provider, worker, and maintenance credentials are intentionally excluded:
 * instrumentation runs before every server function and throwing for an
 * unrelated integration would otherwise take public routes such as OAuth down.
 */
export function validateWebRuntimeEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return
  assertValues(WEB_RUNTIME_ENV, 'BuyerWatch web runtime')
}

export function validateWorkerEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return
  assertValues(WORKER_PRODUCTION_ENV, 'BuyerWatch worker')
  validateOptionalProviders()
  if (!getConfiguredSecret(process.env.ANTHROPIC_API_KEY)) {
    throw new Error('BuyerWatch worker requires ANTHROPIC_API_KEY')
  }
  if (!hasRedditDiscoveryProvider()) {
    throw new Error(
      'BuyerWatch worker requires an enabled Reddit proxy (RedditAPIs discovery fallback)',
    )
  }
}

export function isDevelopmentMockEnabled(
  name: 'USE_MOCK_BLUESKY' | 'USE_MOCK_DRAFTS' | 'USE_MOCK_X',
): boolean {
  return process.env.NODE_ENV !== 'production' && process.env[name] === 'true'
}
