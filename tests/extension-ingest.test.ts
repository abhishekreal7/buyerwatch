import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildExtensionExternalId,
  buildExtensionScoreJobId,
  isExtensionPlatform,
  isValidExtensionSourceUrl,
} from '../src/lib/extension-ingest'

const manifest = JSON.parse(readFileSync(
  join(process.cwd(), 'browser-extension/manifest.json'),
  'utf8',
)) as {
  manifest_version: number
  permissions: string[]
  host_permissions: string[]
  content_scripts: Array<{ matches: string[]; js: string[] }>
}

const ingestRoute = readFileSync(
  join(process.cwd(), 'src/app/api/extension/ingest/route.ts'),
  'utf8',
)
const scoreHandler = readFileSync(
  join(process.cwd(), 'worker/handlers/score-post.ts'),
  'utf8',
)

describe('extension capture validation', () => {
  it.each(['reddit', 'bluesky', 'x'] as const)(
    'accepts the supported %s platform',
    (platform) => {
      expect(isExtensionPlatform(platform)).toBe(true)
    },
  )

  it.each([
    ['reddit', 'https://www.reddit.com/r/startups/comments/abc/example'],
    ['bluesky', 'https://bsky.app/profile/example.com/post/3abc'],
    ['x', 'https://x.com/example/status/123456'],
    ['x', 'https://twitter.com/example/status/123456'],
  ] as const)('accepts a valid %s source URL', (platform, url) => {
    expect(isValidExtensionSourceUrl(platform, url)).toBe(true)
  })

  it.each([
    ['reddit', 'https://reddit.com.evil.test/r/startups'],
    ['bluesky', 'https://bsky.app.evil.test/profile/example'],
    ['x', 'https://x.com.evil.test/example/status/123'],
    ['reddit', 'http://reddit.com/r/startups'],
  ] as const)('rejects an invalid %s source URL', (platform, url) => {
    expect(isValidExtensionSourceUrl(platform, url)).toBe(false)
  })

  it('builds stable user-scoped queue identities', () => {
    const externalId = buildExtensionExternalId('x', '123456')
    expect(externalId).toBe('x:extension:123456')
    expect(buildExtensionScoreJobId('user-1', externalId))
      .toBe(buildExtensionScoreJobId('user-1', externalId))
    expect(buildExtensionScoreJobId('user-1', externalId))
      .not.toBe(buildExtensionScoreJobId('user-2', externalId))
  })
})

describe('extension vertical-slice contracts', () => {
  it('uses Manifest V3 with the minimum interactive permissions', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.permissions).toEqual(['activeTab', 'storage'])
    expect(manifest.content_scripts[0].js).toEqual(['content.js'])
    expect(manifest.content_scripts[0].matches).toEqual(expect.arrayContaining([
      'https://www.reddit.com/*',
      'https://bsky.app/*',
      'https://x.com/*',
    ]))
  })

  it('persists an awaiting-analysis opportunity before optional queueing', () => {
    expect(ingestRoute).toContain(".from('monitored_threads')")
    expect(ingestRoute).toContain("score_reasoning: 'Awaiting analysis'")
    expect(ingestRoute).toContain("automation_reason: 'analysis_pending'")
    expect(ingestRoute).toContain("status: 'awaiting_analysis'")
    expect(ingestRoute).toContain('const canQueue = Boolean(')
  })

  it('does not mistake an unscored capture for a paid AI checkpoint', () => {
    expect(scoreHandler).toContain('const hasScoringCheckpoint = Boolean(')
    expect(scoreHandler).toContain('existing.intent_score !== null')
    expect(scoreHandler).toContain('if (!hasScoringCheckpoint)')
  })
})
