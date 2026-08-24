import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasCloudflareRssShadowConfiguration,
  isAuthorizedCloudflareRssShadowRequest,
  normalizeRssShadowTarget,
  parseRssShadowRunPayload,
} from '../src/lib/cloudflare-rss-shadow'
import type { RssShadowRunPayload } from '../src/lib/cloudflare-rss-shadow'

const runId = '74ec0e67-6d50-4bf6-b347-dbf6e905621a'
const now = new Date().toISOString()

function validPayload(): RssShadowRunPayload {
  return {
    runId,
    startedAt: now,
    completedAt: now,
    workerVersion: '2026-08-24.1',
    results: [{
      target: 'SaaS',
      status: 'success',
      httpStatus: 200,
      postCount: 3,
      feedFingerprint: 'a'.repeat(64),
      errorCode: null,
    }],
  }
}

afterEach(() => vi.unstubAllEnvs())

describe('Cloudflare RSS shadow monitor contract', () => {
  it('normalizes only valid public subreddit names', () => {
    expect(normalizeRssShadowTarget(' r/SaaS ')).toBe('saas')
    expect(normalizeRssShadowTarget('saas/../../secret')).toBeNull()
  })

  it('requires a long, constant-time compared shared secret', () => {
    vi.stubEnv('CLOUDFLARE_RSS_SHADOW_SECRET', 's'.repeat(32))
    expect(hasCloudflareRssShadowConfiguration()).toBe(true)
    expect(isAuthorizedCloudflareRssShadowRequest(`Bearer ${'s'.repeat(32)}`)).toBe(true)
    expect(isAuthorizedCloudflareRssShadowRequest('Bearer wrong')).toBe(false)

    vi.stubEnv('CLOUDFLARE_RSS_SHADOW_SECRET', 'short')
    expect(hasCloudflareRssShadowConfiguration()).toBe(false)
    expect(isAuthorizedCloudflareRssShadowRequest('Bearer short')).toBe(false)
  })

  it('accepts compact success telemetry but rejects replay ambiguity and invalid shapes', () => {
    expect(parseRssShadowRunPayload(validPayload())).toMatchObject({
      runId,
      results: [{ target: 'saas', status: 'success', postCount: 3 }],
    })

    const duplicateTarget = validPayload()
    duplicateTarget.results.push({ ...duplicateTarget.results[0], target: 'r/saas' })
    expect(parseRssShadowRunPayload(duplicateTarget)).toBeNull()

    const fakeSuccess = validPayload()
    fakeSuccess.results[0].feedFingerprint = null
    expect(parseRssShadowRunPayload(fakeSuccess)).toBeNull()

    const errorWithPosts = validPayload()
    errorWithPosts.results[0] = {
      target: 'saas',
      status: 'http_error',
      httpStatus: 429,
      postCount: 1,
      feedFingerprint: null,
      errorCode: 'http_429',
    }
    expect(parseRssShadowRunPayload(errorWithPosts)).toBeNull()
  })

  it('keeps the Cloudflare worker telemetry-only and slower than paid monitoring', async () => {
    const [worker, config, resultsRoute] = await Promise.all([
      import('node:fs/promises').then(fs => fs.readFile('cloudflare/rss-shadow-monitor.mjs', 'utf8')),
      import('node:fs/promises').then(fs => fs.readFile('cloudflare/wrangler.rss-shadow.toml', 'utf8')),
      import('node:fs/promises').then(fs => fs.readFile('src/app/api/internal/rss-shadow/results/route.ts', 'utf8')),
    ])

    expect(config).toContain('*/15 * * * *')
    expect(worker).toContain('/api/internal/rss-shadow/targets')
    expect(worker).toContain('/api/internal/rss-shadow/results')
    expect(worker).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(resultsRoute).not.toContain('processScorePost')
    expect(resultsRoute).not.toContain('dispatchPendingOutbox')
  })
})
