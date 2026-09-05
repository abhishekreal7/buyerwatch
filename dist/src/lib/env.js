"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfiguredSecret = getConfiguredSecret;
exports.hasSprinklrRedditDiscoveryProvider = hasSprinklrRedditDiscoveryProvider;
exports.hasSprinklrRedditPostingProvider = hasSprinklrRedditPostingProvider;
exports.getRedditDiscoveryProviderKind = getRedditDiscoveryProviderKind;
exports.getRedditPostingProviderKind = getRedditPostingProviderKind;
exports.hasRedditDiscoveryProvider = hasRedditDiscoveryProvider;
exports.hasRedditPostingProvider = hasRedditPostingProvider;
exports.getProviderCapabilities = getProviderCapabilities;
exports.validateAppEnvironment = validateAppEnvironment;
exports.validateWebRuntimeEnvironment = validateWebRuntimeEnvironment;
exports.validateWorkerEnvironment = validateWorkerEnvironment;
exports.isDevelopmentMockEnabled = isDevelopmentMockEnabled;
const CORE_PRODUCTION_ENV = [
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SUPPORT_EMAIL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'UPSTASH_REDIS_URL',
    'CRON_SECRET',
    'ENCRYPTION_KEY',
];
const WEB_RUNTIME_ENV = [
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'UPSTASH_REDIS_URL',
];
const WORKER_PRODUCTION_ENV = [
    ...CORE_PRODUCTION_ENV,
    'ADMIN_SECRET',
];
function assertValues(names, scope) {
    const missing = names.filter((name) => !process.env[name]?.trim());
    if (missing.length > 0) {
        throw new Error(`${scope} is missing required environment variables: ${missing.join(', ')}`);
    }
    if (process.env.NEXT_PUBLIC_APP_URL &&
        !process.env.NEXT_PUBLIC_APP_URL.startsWith('https://')) {
        throw new Error(`${scope} requires NEXT_PUBLIC_APP_URL to use HTTPS`);
    }
    if (process.env.ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
        throw new Error(`${scope} requires ENCRYPTION_KEY to be 64 hexadecimal characters`);
    }
    for (const secretName of ['CRON_SECRET', 'ADMIN_SECRET']) {
        const value = process.env[secretName];
        if (value && value.length < 32) {
            throw new Error(`${scope} requires ${secretName} to be at least 32 characters`);
        }
    }
}
function assertCompleteOptionalGroup(names, label) {
    const configured = names.filter((name) => process.env[name]?.trim());
    if (configured.length > 0 && configured.length !== names.length) {
        const missing = names.filter((name) => !process.env[name]?.trim());
        throw new Error(`${label} is partially configured; missing: ${missing.join(', ')}`);
    }
}
function assertOptionalInteger(name, minimum, maximum) {
    const raw = process.env[name]?.trim();
    if (!raw)
        return;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
    }
}
function getConfiguredSecret(value) {
    const trimmed = value?.trim() ?? '';
    if (!trimmed
        || trimmed.startsWith('#')
        || trimmed.toLocaleLowerCase().includes('todo')
        || trimmed.toLocaleLowerCase().includes('placeholder')) {
        return '';
    }
    return trimmed;
}
const SPRINKLR_REDDIT_REQUIRED_ENV = [
    'SPRINKLR_API_BASE_URL',
    'SPRINKLR_API_KEY',
    'SPRINKLR_ACCESS_TOKEN',
    'SPRINKLR_REDDIT_TOPIC_ID',
    'SPRINKLR_REDDIT_ACCOUNT_ID',
    'SPRINKLR_REDDIT_CHANNEL_ID',
    'SPRINKLR_REDDIT_CAMPAIGN_ID',
];
function hasCompleteSprinklrRedditConfiguration() {
    return SPRINKLR_REDDIT_REQUIRED_ENV.every(name => (Boolean(getConfiguredSecret(process.env[name]))));
}
function hasSprinklrRedditDiscoveryProvider() {
    return process.env.SPRINKLR_REDDIT_DISCOVERY_ENABLED === 'true'
        && hasCompleteSprinklrRedditConfiguration();
}
function hasSprinklrRedditPostingProvider() {
    return process.env.SPRINKLR_REDDIT_POSTING_ENABLED === 'true'
        && hasCompleteSprinklrRedditConfiguration();
}
function getRedditDiscoveryProviderKind() {
    if (hasSprinklrRedditDiscoveryProvider())
        return 'sprinklr';
    // REDDITAPIS_FALLBACK_ENABLED was the original name while RSS was the
    // primary path. Keep it as a compatibility alias for already-deployed
    // environments, but let the explicit discovery switch take precedence.
    const configured = process.env.REDDITAPIS_DISCOVERY_ENABLED?.trim();
    const enabled = configured === 'true' || configured === 'false'
        ? configured === 'true'
        : process.env.REDDITAPIS_FALLBACK_ENABLED === 'true';
    return enabled && Boolean(getConfiguredSecret(process.env.REDDITAPIS_API_KEY))
        ? 'redditapis'
        : null;
}
function getRedditPostingProviderKind() {
    if (hasSprinklrRedditPostingProvider())
        return 'sprinklr';
    if (process.env.HYPERBROWSER_POSTING_ENABLED === 'true'
        && Boolean(getConfiguredSecret(process.env.HYPERBROWSER_API_KEY)))
        return 'hyperbrowser';
    return process.env.REDDITAPIS_POSTING_ENABLED === 'true'
        && Boolean(getConfiguredSecret(process.env.REDDITAPIS_API_KEY))
        ? 'redditapis'
        : null;
}
function hasRedditDiscoveryProvider() {
    return getRedditDiscoveryProviderKind() !== null;
}
/** Reddit writes require both the provider key and an explicit kill switch. */
function hasRedditPostingProvider() {
    return getRedditPostingProviderKind() !== null;
}
function getProviderCapabilities() {
    return {
        aiDrafting: Boolean(getConfiguredSecret(process.env.ANTHROPIC_API_KEY)),
        billing: Boolean(process.env.DODO_PAYMENTS_API_KEY
            && process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID
            && process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
            && process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID
            && process.env.DODO_PAYMENTS_STARTER_ANNUAL_PRODUCT_ID
            && process.env.DODO_PAYMENTS_PRO_ANNUAL_PRODUCT_ID
            && process.env.DODO_PAYMENTS_GROWTH_ANNUAL_PRODUCT_ID
            && process.env.DODO_PAYMENTS_WEBHOOK_SECRET
            && (process.env.DODO_PAYMENTS_ENVIRONMENT === 'test_mode'
                || process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode')),
        redditDiscovery: hasRedditDiscoveryProvider(),
        redditPosting: hasRedditPostingProvider(),
        // Public Bluesky discovery is keyless. Credentials are only needed when a
        // user connects their own account for posting.
        bluesky: true,
        x: Boolean(process.env.X_API_KEY
            && process.env.X_API_SECRET
            && process.env.X_ACCESS_TOKEN
            && process.env.X_ACCESS_SECRET),
        email: Boolean(process.env.RESEND_API_KEY),
        sentry: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    };
}
function validateOptionalProviders() {
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
    ], 'Dodo billing');
    if (process.env.DODO_PAYMENTS_API_KEY
        && process.env.DODO_PAYMENTS_ENVIRONMENT !== 'test_mode'
        && process.env.DODO_PAYMENTS_ENVIRONMENT !== 'live_mode') {
        throw new Error('DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode');
    }
    assertCompleteOptionalGroup([
        'DODO_PAYMENTS_SIGNAL_20_PRODUCT_ID',
        'DODO_PAYMENTS_SIGNAL_50_PRODUCT_ID',
        'DODO_PAYMENTS_SIGNAL_120_PRODUCT_ID',
        'DODO_PAYMENTS_DRAFT_5_PRODUCT_ID',
        'DODO_PAYMENTS_DRAFT_12_PRODUCT_ID',
        'DODO_PAYMENTS_DRAFT_30_PRODUCT_ID',
    ], 'Dodo add-on billing');
    assertCompleteOptionalGroup([
        'RESEND_API_KEY',
        'RESEND_FROM_EMAIL',
    ], 'Resend email');
    if (process.env.REDDITAPIS_POSTING_ENABLED === 'true'
        && !getConfiguredSecret(process.env.REDDITAPIS_API_KEY)) {
        throw new Error('RedditAPIs posting is enabled but REDDITAPIS_API_KEY is missing');
    }
    assertOptionalBoolean('HYPERBROWSER_POSTING_ENABLED');
    if (process.env.HYPERBROWSER_POSTING_ENABLED === 'true'
        && !getConfiguredSecret(process.env.HYPERBROWSER_API_KEY)) {
        throw new Error('Hyperbrowser posting is enabled but HYPERBROWSER_API_KEY is missing');
    }
    assertOptionalInteger('HYPERBROWSER_REDDIT_MAX_CONCURRENCY', 1, 25);
    assertOptionalInteger('HYPERBROWSER_CREDIT_ALERT_PERCENT', 1, 100);
    assertCompleteOptionalGroup(SPRINKLR_REDDIT_REQUIRED_ENV, 'Sprinklr Reddit');
    assertOptionalBoolean('SPRINKLR_REDDIT_DISCOVERY_ENABLED');
    assertOptionalBoolean('SPRINKLR_REDDIT_POSTING_ENABLED');
    assertOptionalInteger('SPRINKLR_DISCOVERY_CACHE_SECONDS', 60, 900);
    if ((process.env.SPRINKLR_REDDIT_DISCOVERY_ENABLED === 'true'
        || process.env.SPRINKLR_REDDIT_POSTING_ENABLED === 'true')
        && !hasCompleteSprinklrRedditConfiguration()) {
        throw new Error('Sprinklr Reddit is enabled but its required configuration is incomplete');
    }
    const sprinklrBaseUrl = process.env.SPRINKLR_API_BASE_URL?.trim();
    if (sprinklrBaseUrl) {
        try {
            const url = new URL(sprinklrBaseUrl);
            if (url.protocol !== 'https:'
                || url.hostname.toLowerCase() !== 'api3.sprinklr.com'
                || url.search
                || url.hash)
                throw new Error('invalid');
        }
        catch {
            throw new Error('SPRINKLR_API_BASE_URL must be an HTTPS api3.sprinklr.com URL');
        }
    }
    assertOptionalInteger('SPRINKLR_REDDIT_ACCOUNT_ID', 1, Number.MAX_SAFE_INTEGER);
    assertOptionalBoolean('REDDITAPIS_DISCOVERY_ENABLED');
    assertOptionalBoolean('REDDITAPIS_FALLBACK_ENABLED');
    assertOptionalBoolean('REDDIT_REPLY_TRACKING_ENABLED');
    assertOptionalInteger('REDDITAPIS_MAX_DAILY_READ_CALLS', 0, 100_000);
    assertOptionalInteger('REDDITAPIS_MAX_DAILY_WRITE_CALLS', 0, 100_000);
    assertOptionalInteger('REDDITAPIS_DISCOVERY_CACHE_SECONDS', 300, 1_800);
    assertOptionalInteger('REDDIT_REPLY_TRACKING_INTERVAL_MINUTES', 15, 360);
    assertOptionalInteger('REDDIT_AUTO_MIN_ACCOUNT_AGE_DAYS', 7, 365);
    assertOptionalInteger('REDDIT_AUTO_MIN_COMBINED_KARMA', 0, 100_000);
    assertCompleteOptionalGroup([
        'BLUESKY_HANDLE',
        'BLUESKY_APP_PASSWORD',
    ], 'Bluesky');
    assertCompleteOptionalGroup([
        'X_API_KEY',
        'X_API_SECRET',
        'X_ACCESS_TOKEN',
        'X_ACCESS_SECRET',
    ], 'X');
}
function assertOptionalBoolean(name) {
    const raw = process.env[name]?.trim();
    if (raw && raw !== 'true' && raw !== 'false') {
        throw new Error(`${name} must be true or false`);
    }
}
function assertOptionalSecret(name, minimumLength = 32) {
    const raw = process.env[name]?.trim();
    if (raw && raw.length < minimumLength) {
        throw new Error(`${name} must be at least ${minimumLength} characters`);
    }
}
function validateAppEnvironment() {
    if (process.env.NODE_ENV !== 'production')
        return;
    assertValues(CORE_PRODUCTION_ENV, 'BuyerWatch app');
    validateOptionalProviders();
    assertOptionalSecret('CLOUDFLARE_RSS_SHADOW_SECRET');
    assertOptionalInteger('CLOUDFLARE_RSS_SHADOW_MAX_TARGETS', 1, 100);
    if (!getConfiguredSecret(process.env.ANTHROPIC_API_KEY)) {
        throw new Error('BuyerWatch app requires ANTHROPIC_API_KEY');
    }
}
/**
 * Validate only the configuration required to boot the Next.js request runtime.
 *
 * Provider, worker, and maintenance credentials are intentionally excluded:
 * instrumentation runs before every server function and throwing for an
 * unrelated integration would otherwise take public routes such as OAuth down.
 */
function validateWebRuntimeEnvironment() {
    if (process.env.NODE_ENV !== 'production')
        return;
    assertValues(WEB_RUNTIME_ENV, 'BuyerWatch web runtime');
}
function validateWorkerEnvironment() {
    if (process.env.NODE_ENV !== 'production')
        return;
    assertValues(WORKER_PRODUCTION_ENV, 'BuyerWatch worker');
    validateOptionalProviders();
    assertOptionalSecret('CLOUDFLARE_RSS_SHADOW_SECRET');
    assertOptionalInteger('CLOUDFLARE_RSS_SHADOW_MAX_TARGETS', 1, 100);
    if (!getConfiguredSecret(process.env.ANTHROPIC_API_KEY)) {
        throw new Error('BuyerWatch worker requires ANTHROPIC_API_KEY');
    }
    if (!hasRedditDiscoveryProvider()) {
        throw new Error('BuyerWatch worker requires enabled RedditAPIs discovery or another enabled Reddit discovery provider');
    }
}
function isDevelopmentMockEnabled(name) {
    return process.env.NODE_ENV !== 'production' && process.env[name] === 'true';
}
