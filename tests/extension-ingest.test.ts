import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
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
  name: string
  manifest_version: number
  key: string
  permissions: string[]
  host_permissions: string[]
  icons: Record<string, string>
  action: { default_icon: Record<string, string> }
  content_scripts: Array<{ matches: string[]; js: string[] }>
}
const popupScript = readFileSync(
  join(process.cwd(), 'browser-extension/popup.js'),
  'utf8',
)
const optionsScript = readFileSync(
  join(process.cwd(), 'browser-extension/options.js'),
  'utf8',
)
const bridgeScript = readFileSync(
  join(process.cwd(), 'browser-extension/bridge.js'),
  'utf8',
)
const extensionInstallSource = readFileSync(
  join(process.cwd(), 'src/components/ExtensionInstall.tsx'),
  'utf8',
)

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
    const captureScript = manifest.content_scripts.find(({ js }) => js.includes('content.js'))
    const bridgeScript = manifest.content_scripts.find(({ js }) => js.includes('bridge.js'))
    expect(captureScript?.matches).toEqual([
      'https://*.reddit.com/*',
      'https://reddit.com/*',
    ])
    expect(bridgeScript?.matches).toEqual(expect.arrayContaining([
      'https://buyerwatch.co/*',
      'https://www.buyerwatch.co/*',
    ]))
    expect(manifest.host_permissions).not.toEqual(expect.arrayContaining([
      'https://bsky.app/*',
      'https://x.com/*',
    ]))
  })

  it('uses the BuyerWatch production identity and extension icons', () => {
    expect(manifest.name).toBe('BuyerWatch')
    expect(manifest.key).toBeTruthy()
    expect(manifest.icons).toEqual({
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    })
    expect(manifest.action.default_icon).toEqual({
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
    })
    expect(popupScript).toContain("const DEFAULT_APP_URL = 'https://buyerwatch.co'")
    expect(optionsScript).toContain("const DEFAULT_APP_URL = 'https://buyerwatch.co'")
    expect(popupScript).toContain('return `https://${raw}`')
    expect(optionsScript).toContain('return `https://${raw}`')
    expect(ingestRoute).toContain("chrome-extension://akfjpaggkndebeidadabipjpkbchlhfe")
  })

  it('connects the installed extension to the active BuyerWatch website session', () => {
    expect(extensionInstallSource).toContain("new CustomEvent('buyerwatch:extension-session'")
    expect(extensionInstallSource).toContain('session.user.id !== userId')
    expect(bridgeScript).toContain("window.addEventListener('buyerwatch:extension-session'")
    expect(bridgeScript).toContain('chrome.storage.local.set({ buyerwatchSession: session })')
    expect(popupScript).toContain('If you use Google sign-in, refresh BuyerWatch')
  })

  it('stores only valid BuyerWatch session handoffs in extension storage', async () => {
    const listeners = new Map<string, Array<(event: TestCustomEvent) => unknown>>()
    const pending: Promise<unknown>[] = []
    const stored: unknown[] = []

    class TestCustomEvent {
      type: string
      detail: unknown

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    }

    const testWindow = {
      addEventListener(type: string, listener: (event: TestCustomEvent) => unknown) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener])
      },
      dispatchEvent(event: TestCustomEvent) {
        for (const listener of listeners.get(event.type) ?? []) {
          pending.push(Promise.resolve(listener(event)))
        }
        return true
      },
    }

    runInNewContext(bridgeScript, {
      CustomEvent: TestCustomEvent,
      JSON,
      window: testWindow,
      document: {
        documentElement: { setAttribute() {} },
      },
      chrome: {
        storage: {
          local: {
            async set(value: unknown) {
              stored.push(value)
            },
          },
        },
      },
    })

    testWindow.dispatchEvent(new TestCustomEvent('buyerwatch:extension-session', {
      detail: JSON.stringify({ access_token: 'incomplete' }),
    }))
    testWindow.dispatchEvent(new TestCustomEvent('buyerwatch:extension-session', {
      detail: JSON.stringify({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: 1_900_000_000,
        user: { id: 'user-1', email: 'user@example.com' },
      }),
    }))

    await Promise.all(pending)
    expect(stored).toEqual([{
      buyerwatchSession: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: 1_900_000_000,
        user: { id: 'user-1', email: 'user@example.com' },
      },
    }])
  })

  it('persists an awaiting-analysis opportunity before optional dispatch', () => {
    expect(ingestRoute).toContain(".from('monitored_threads')")
    expect(ingestRoute).toContain("score_reasoning: 'Awaiting analysis'")
    expect(ingestRoute).toContain("automation_reason: 'analysis_pending'")
    expect(ingestRoute).toContain("status: 'awaiting_analysis'")
    expect(ingestRoute).toContain('const canDispatch = Boolean(')
    expect(ingestRoute).toContain("publishQStashJson('/api/jobs/score'")
  })

  it('does not mistake an unscored capture for a paid AI checkpoint', () => {
    expect(scoreHandler).toContain('const hasScoringCheckpoint = Boolean(')
    expect(scoreHandler).toContain('existing.intent_score !== null')
    expect(scoreHandler).toContain('if (!hasScoringCheckpoint)')
  })
})
