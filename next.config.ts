import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  deploymentId: process.env.DEPLOYMENT_VERSION,
  // playwright-core reads this registry at module initialization. Next's
  // tracer does not discover the dynamic JSON lookup, so include the one
  // runtime asset explicitly in server functions that load cloud delivery.
  outputFileTracingIncludes: {
    '/*': ['node_modules/playwright-core/browsers.json'],
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }]
  },
};

const sentryBuildConfigured = Boolean(
  process.env.SENTRY_ORG
  && process.env.SENTRY_PROJECT
  && process.env.SENTRY_AUTH_TOKEN,
)

export default sentryBuildConfigured
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig
