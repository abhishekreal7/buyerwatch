import { describe, expect, it } from 'vitest'
import { validateReadinessResponse } from '../scripts/production-smoke-validators.mjs'

function readinessResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const healthyCore = {
  database: { status: 'ok' },
  cache: { status: 'ok' },
}

describe('production readiness synthetic', () => {
  it('accepts healthy readiness', async () => {
    await expect(validateReadinessResponse(readinessResponse(200, {
      status: 'ok',
      checks: healthyCore,
    }))).resolves.toEqual({ degraded: false })
  })

  it('temporarily accepts Reddit-only staleness before an account is connected', async () => {
    const response = readinessResponse(503, {
      status: 'degraded',
      checks: {
        ...healthyCore,
        monitoring: {
          status: 'error',
          code: 'monitoring_stale',
          affectedPlatforms: ['reddit'],
        },
        redditProvider: { status: 'error' },
      },
      dependencies: { redditProviderRequired: false },
    })

    await expect(validateReadinessResponse(response, {
      allowRedditOnlyDegraded: true,
    })).resolves.toEqual({ degraded: true })
  })

  it('fails for Bluesky staleness or a connected Reddit account', async () => {
    const bluesky = readinessResponse(503, {
      status: 'degraded',
      checks: {
        ...healthyCore,
        monitoring: {
          status: 'error',
          code: 'monitoring_stale',
          affectedPlatforms: ['bluesky'],
        },
      },
      dependencies: { redditProviderRequired: false },
    })
    await expect(validateReadinessResponse(bluesky, {
      allowRedditOnlyDegraded: true,
    })).rejects.toThrow(/not Reddit-only/)

    const connected = readinessResponse(503, {
      status: 'degraded',
      checks: {
        ...healthyCore,
        monitoring: {
          status: 'error',
          code: 'monitoring_stale',
          affectedPlatforms: ['reddit'],
        },
      },
      dependencies: { redditProviderRequired: true },
    })
    await expect(validateReadinessResponse(connected, {
      allowRedditOnlyDegraded: true,
    })).rejects.toThrow(/not Reddit-only/)
  })
})
