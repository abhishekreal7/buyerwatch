import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  buildExtensionExternalId,
  buildExtensionScoreJobId,
  extensionSourceIdentity,
  isExtensionPlatform,
  isValidExtensionSourceUrl,
  normalizeExtensionTimestamps,
} from '../src/lib/extension-ingest'
import {
  BUYERWATCH_EXTENSION_ID,
  BUYERWATCH_EXTENSION_ORIGIN,
  isAllowedBuyerWatchExtensionOrigin,
} from '../src/lib/extension-identity'

const manifest = JSON.parse(readFileSync(
  join(process.cwd(), 'browser-extension/manifest.json'),
  'utf8',
)) as {
  name: string
  manifest_version: number
  version: string
  minimum_chrome_version: string
  incognito: string
  key: string
  permissions: string[]
  host_permissions: string[]
  icons: Record<string, string>
  action: { default_icon: Record<string, string> }
  background: { service_worker: string }
  externally_connectable: { matches: string[]; accepts_tls_channel_id: boolean }
  content_scripts: Array<{ matches: string[]; js: string[] }>
}
const popupScript = readFileSync(
  join(process.cwd(), 'browser-extension/popup.js'),
  'utf8',
)
const commonScript = readFileSync(
  join(process.cwd(), 'browser-extension/common.js'),
  'utf8',
)
const optionsScript = readFileSync(
  join(process.cwd(), 'browser-extension/options.js'),
  'utf8',
)
const backgroundScript = readFileSync(
  join(process.cwd(), 'browser-extension/background.js'),
  'utf8',
)
const contentScript = readFileSync(
  join(process.cwd(), 'browser-extension/content.js'),
  'utf8',
)
const extensionInstallSource = readFileSync(
  join(process.cwd(), 'src/components/ExtensionInstall.tsx'),
  'utf8',
)
const extensionClientSource = readFileSync(
  join(process.cwd(), 'src/lib/extension-client.ts'),
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
const replyStatusRoute = readFileSync(
  join(process.cwd(), 'src/app/api/extension/reply-status/route.ts'),
  'utf8',
)

function extensionIdFromManifestKey(key: string): string {
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest()
  return [...digest.subarray(0, 16)]
    .map(byte => `${String.fromCharCode(97 + (byte >> 4))}${String.fromCharCode(97 + (byte & 15))}`)
    .join('')
}

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
    ['reddit', 'https://user:secret@reddit.com/r/startups/comments/abc123/example/'],
    ['reddit', 'https://reddit.com:444/r/startups/comments/abc123/example/'],
    ['reddit', 'https://www.reddit.com/r/startups/'],
    ['reddit', 'https://www.reddit.com/search/?q=lead+generation'],
    ['bluesky', 'https://bsky.app/profile/example.com'],
    ['x', 'https://x.com/example'],
  ] as const)('rejects an invalid %s source URL', (platform, url) => {
    expect(isValidExtensionSourceUrl(platform, url)).toBe(false)
  })

  it('derives a canonical source identity from the validated URL', () => {
    expect(extensionSourceIdentity(
      'reddit',
      'https://www.reddit.com/r/SaaS/comments/AbC123/example/comment456/?utm_source=test#reply',
    )).toEqual({
      sourceEventId: 'abc123',
      sourceUrl: 'https://www.reddit.com/r/SaaS/comments/AbC123/example/comment456/',
    })
    expect(extensionSourceIdentity('reddit', 'https://www.reddit.com/r/SaaS/')).toBeNull()
  })

  it('locks app and Reddit URLs to safe origins without credentials or custom ports', () => {
    const context = { AbortController, URL, clearTimeout, setTimeout }
    runInNewContext(commonScript, context)
    const common = (context as unknown as {
      BuyerWatchExtensionCommon: {
        normalizeAppUrl: (value: string) => string
        parseRedditPostUrl: (value: string) => unknown
      }
    }).BuyerWatchExtensionCommon

    expect(common.normalizeAppUrl('buyerwatch.co')).toBe('https://buyerwatch.co')
    expect(common.normalizeAppUrl('localhost:3000')).toBe('http://localhost:3000')
    expect(() => common.normalizeAppUrl('https://buyerwatch.co/settings')).toThrow('invalid_app_url')
    expect(() => common.normalizeAppUrl('https://buyerwatch.co:444')).toThrow('invalid_app_url')
    expect(() => common.normalizeAppUrl('https://user:secret@buyerwatch.co')).toThrow('invalid_app_url')
    expect(common.parseRedditPostUrl(
      'https://user:secret@reddit.com/r/SaaS/comments/abc123/example/',
    )).toBeNull()
  })

  it('builds stable user-scoped queue identities', () => {
    const externalId = buildExtensionExternalId('x', '123456')
    expect(externalId).toBe('x:extension:123456')
    expect(buildExtensionScoreJobId('user-1', externalId))
      .toBe(buildExtensionScoreJobId('user-1', externalId))
    expect(buildExtensionScoreJobId('user-1', externalId))
      .not.toBe(buildExtensionScoreJobId('user-2', externalId))
  })

  it('keeps a valid source publication time separate from capture time', () => {
    const now = Date.parse('2026-08-08T12:00:00.000Z')
    expect(normalizeExtensionTimestamps(
      '2026-08-08T11:59:00.000Z',
      '2026-07-01T09:30:00.000Z',
      now,
    )).toEqual({
      capturedAt: '2026-08-08T11:59:00.000Z',
      sourceCreatedAt: '2026-07-01T09:30:00.000Z',
    })
  })

  it('rejects untrusted future or implausibly old source timestamps', () => {
    const now = Date.parse('2026-08-08T12:00:00.000Z')
    expect(normalizeExtensionTimestamps(
      '2026-08-08T11:59:00.000Z',
      '2026-08-09T00:00:00.000Z',
      now,
    ).sourceCreatedAt).toBe('2026-08-08T11:59:00.000Z')
    expect(normalizeExtensionTimestamps(
      'invalid',
      '1980-01-01T00:00:00.000Z',
      now,
    )).toEqual({
      capturedAt: '2026-08-08T12:00:00.000Z',
      sourceCreatedAt: '2026-08-08T12:00:00.000Z',
    })
  })
})

describe('extension vertical-slice contracts', () => {
  it('uses Manifest V3 with the minimum interactive permissions', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.version).toBe('1.0.0')
    expect(Number(manifest.minimum_chrome_version)).toBeGreaterThanOrEqual(109)
    expect(manifest.permissions).toEqual(['activeTab', 'storage'])
    expect(manifest.incognito).toBe('not_allowed')
    const captureScript = manifest.content_scripts.find(({ js }) => js.includes('content.js'))
    const bridgeScript = manifest.content_scripts.find(({ js }) => js.includes('bridge.js'))
    expect(captureScript?.matches).toEqual([
      'https://*.reddit.com/r/*/comments/*',
      'https://reddit.com/r/*/comments/*',
      'https://*.reddit.com/comments/*',
      'https://reddit.com/comments/*',
    ])
    expect(bridgeScript).toBeUndefined()
    expect(manifest.externally_connectable).toEqual({
      matches: [
      'https://buyerwatch.co/*',
      'https://www.buyerwatch.co/*',
      ],
      accepts_tls_channel_id: false,
    })
    expect(manifest.background.service_worker).toBe('background.js')
    expect(manifest.host_permissions).not.toEqual(expect.arrayContaining([
      'https://bsky.app/*',
      'https://x.com/*',
      'https://*.supabase.co/*',
      'http://localhost:3000/*',
      'https://*.reddit.com/*',
      'https://reddit.com/*',
    ]))
    expect(manifest.host_permissions).toContain('https://nenarlpygxtkdxbjqrtb.supabase.co/*')
    expect(captureScript?.js[0]).toBe('common.js')
  })

  it('uses the BuyerWatch production identity and extension icons', () => {
    expect(manifest.name).toBe('BuyerWatch')
    expect(extensionIdFromManifestKey(manifest.key)).toBe(BUYERWATCH_EXTENSION_ID)
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
    expect(commonScript).toContain("const DEFAULT_APP_URL = 'https://buyerwatch.co'")
    expect(popupScript).toContain('BuyerWatchExtensionCommon.getConfig()')
    expect(optionsScript).toContain('BuyerWatchExtensionCommon.DEFAULT_APP_URL')
    expect(extensionClientSource).toContain('PACKAGED_EXTENSION_ID')
    expect(ingestRoute).toContain('isAllowedBuyerWatchExtensionOrigin')
    expect(replyStatusRoute).toContain('isAllowedBuyerWatchExtensionOrigin')
  })

  it('allows only the signed or explicitly configured extension origins in production', () => {
    expect(isAllowedBuyerWatchExtensionOrigin(BUYERWATCH_EXTENSION_ORIGIN, '', true)).toBe(true)
    expect(isAllowedBuyerWatchExtensionOrigin(
      'chrome-extension://phcokpjbojimiijfebdbiepgfmnopkbd',
      '',
      true,
    )).toBe(false)
    expect(isAllowedBuyerWatchExtensionOrigin(
      'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '',
      true,
    )).toBe(false)
    expect(isAllowedBuyerWatchExtensionOrigin(
      'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      true,
    )).toBe(true)
  })

  it('uses origin-restricted external messaging for the production session handoff', () => {
    expect(extensionInstallSource).toContain('syncBuyerWatchExtensionSession(session, userId)')
    expect(extensionClientSource).toContain("type: 'BUYERWATCH_EXTENSION_SESSION'")
    expect(extensionClientSource).toContain('runtime.sendMessage(BUYERWATCH_EXTENSION_ID')
    expect(backgroundScript).toContain('chrome.runtime.onMessageExternal.addListener')
    expect(backgroundScript).toContain("'https://buyerwatch.co'")
    expect(backgroundScript).toContain("'https://www.buyerwatch.co'")
    expect(popupScript).toContain('If you use Google sign-in, refresh BuyerWatch')
  })

  it('stores only valid, sanitized sessions from an allowed BuyerWatch sender', async () => {
    const stored: unknown[] = []
    const expiresAt = Math.floor(Date.now() / 1000) + 3_600
    const context = {
      AbortController,
      Date,
      URL,
      clearTimeout,
      setTimeout,
      importScripts() {},
      chrome: {
        storage: {
          local: {
            async set(value: unknown) {
              stored.push(value)
            },
          },
        },
        runtime: {
          getManifest: () => manifest,
          onMessageExternal: { addListener() {} },
        },
      },
    }
    runInNewContext(commonScript, context)
    runInNewContext(backgroundScript, context)
    const api = (context as unknown as {
      BuyerWatchExtensionBackground: {
        handleExternalMessage: (
          message: unknown,
          sender: { url: string },
        ) => Promise<{ success: boolean; error?: string }>
      }
    }).BuyerWatchExtensionBackground
    const session = {
      access_token: 'access-token-that-is-long-enough',
      refresh_token: 'refresh-token-that-is-long-enough',
      expires_at: expiresAt,
      expires_in: 3_600,
      token_type: 'bearer',
      provider_token: 'must-not-be-stored',
      user: {
        id: 'b7b1209a-a5d3-4abc-8d82-f310b8594ed8',
        email: 'user@example.com',
        user_metadata: { secret: true },
      },
    }

    expect(await api.handleExternalMessage(
      { type: 'BUYERWATCH_EXTENSION_SESSION', session },
      { url: 'https://attacker.example/' },
    )).toEqual({ success: false, error: 'sender_not_allowed' })
    expect(await api.handleExternalMessage(
      { type: 'BUYERWATCH_EXTENSION_SESSION', session: { access_token: 'short' } },
      { url: 'https://buyerwatch.co/dashboard' },
    )).toEqual({ success: false, error: 'invalid_session' })
    expect(await api.handleExternalMessage(
      { type: 'BUYERWATCH_EXTENSION_SESSION', session },
      { url: 'https://buyerwatch.co/dashboard' },
    )).toEqual({ success: true })

    expect(stored).toEqual([{
      buyerwatchSession: {
        access_token: 'access-token-that-is-long-enough',
        refresh_token: 'refresh-token-that-is-long-enough',
        expires_at: expiresAt,
        expires_in: 3_600,
        token_type: 'bearer',
        user: { id: 'b7b1209a-a5d3-4abc-8d82-f310b8594ed8', email: 'user@example.com' },
      },
    }])
  })

  it('accepts only a validated Reddit reply from an allowed BuyerWatch sender', async () => {
    const stored: unknown[] = []
    const context = {
      AbortController,
      Date,
      URL,
      clearTimeout,
      setTimeout,
      importScripts() {},
      chrome: {
        storage: { local: { async set(value: unknown) { stored.push(value) } } },
        runtime: {
          getManifest: () => manifest,
          onMessageExternal: { addListener() {} },
        },
      },
    }
    runInNewContext(commonScript, context)
    runInNewContext(backgroundScript, context)
    const api = (context as unknown as {
      BuyerWatchExtensionBackground: {
        handleExternalMessage: (
          message: unknown,
          sender: { url: string },
        ) => Promise<Record<string, unknown>>
      }
    }).BuyerWatchExtensionBackground
    const reply = {
      threadId: 'b7b1209a-a5d3-4abc-8d82-f310b8594ed8',
      text: 'A useful reply that the user will review before submitting.',
      postUrl: 'https://www.reddit.com/r/SaaS/comments/AbC123/example/?utm_source=test',
    }

    expect(await api.handleExternalMessage(
      { type: 'BUYERWATCH_PREPARE_REPLY', reply: { ...reply, postUrl: 'https://www.reddit.com/r/SaaS/' } },
      { url: 'https://buyerwatch.co/dashboard' },
    )).toEqual({ success: false, error: 'invalid_reply' })
    expect(await api.handleExternalMessage(
      { type: 'BUYERWATCH_PREPARE_REPLY', reply },
      { url: 'https://buyerwatch.co/dashboard' },
    )).toMatchObject({ success: true, threadId: reply.threadId })
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      buyerwatchPendingReply: {
        threadId: reply.threadId,
        text: reply.text,
        postUrl: 'https://www.reddit.com/r/SaaS/comments/AbC123/example/',
      },
    })
  })

  it('keeps a concurrently rotated session after a stale refresh token is rejected', async () => {
    const removed: string[] = []
    const rotated = {
      access_token: 'new-access-token-that-is-long-enough',
      refresh_token: 'new-refresh-token-that-is-long-enough',
      expires_at: Math.floor(Date.now() / 1000) + 3_600,
      user: { id: 'b7b1209a-a5d3-4abc-8d82-f310b8594ed8' },
    }
    const context = {
      AbortController,
      Date,
      URL,
      clearTimeout,
      setTimeout,
      fetch: async () => ({ ok: false, status: 401 }),
      chrome: {
        storage: {
          local: {
            async get() { return { buyerwatchSession: rotated } },
            async set() {},
            async remove(key: string) { removed.push(key) },
          },
          sync: { async get() { return {} } },
        },
        runtime: { getManifest: () => manifest },
      },
    }
    runInNewContext(commonScript, context)
    const common = (context as unknown as {
      BuyerWatchExtensionCommon: {
        refreshSession: (config: unknown, session: unknown) => Promise<unknown>
      }
    }).BuyerWatchExtensionCommon
    const result = await common.refreshSession({
      supabaseUrl: 'https://nenarlpygxtkdxbjqrtb.supabase.co',
      supabaseAnonKey: 'public-anon-key',
    }, {
      access_token: 'old-access-token-that-is-long-enough',
      refresh_token: 'old-refresh-token-that-is-long-enough',
    })

    expect(result).toEqual(rotated)
    expect(removed).toEqual([])
  })

  it('ships a deterministic ZIP that exactly matches the reviewed source files', () => {
    const expectedFiles = [
      'README.md',
      'background.js',
      'common.js',
      'content.js',
      'icons/icon-16.png',
      'icons/icon-32.png',
      'icons/icon-48.png',
      'icons/icon-128.png',
      'manifest.json',
      'options.css',
      'options.html',
      'options.js',
      'popup.css',
      'popup.html',
      'popup.js',
    ].sort()
    const packaged = unzipSync(new Uint8Array(readFileSync(
      join(process.cwd(), 'public/buyerwatch-extension.zip'),
    )))

    expect(Object.keys(packaged).sort()).toEqual(expectedFiles)
    for (const file of expectedFiles) {
      expect(Buffer.from(packaged[file])).toEqual(
        readFileSync(join(process.cwd(), 'browser-extension', file)),
      )
    }
  })

  it('captures only an exact Reddit post and preserves its publication time', () => {
    const postUrl = 'https://www.reddit.com/r/SaaS/comments/abc123/need_help/'
    const bodyNode = {
      innerText: 'I need a reliable way to find my first ten customers.',
      textContent: 'I need a reliable way to find my first ten customers.',
    }
    const attributes: Record<string, string> = {
      'post-id': 'abc123',
      'post-title': 'How do I find my first customers?',
      author: 'founder-example',
      'subreddit-prefixed-name': 'r/SaaS',
      'created-timestamp': '2026-08-01T09:30:00.000Z',
    }
    const post = {
      id: '',
      getAttribute: (name: string) => attributes[name] ?? null,
      querySelector: (selector: string) => selector === '[slot="text-body"]' ? bodyNode : null,
      querySelectorAll: () => [],
    }
    const document = {
      querySelector: (selector: string) => selector === 'link[rel="canonical"]'
        ? { href: postUrl }
        : null,
      querySelectorAll: (selector: string) => selector === 'shreddit-post' ? [post] : [],
    }
    const context = {
      AbortController,
      Date,
      Promise,
      URL,
      clearTimeout,
      setTimeout,
      document,
      window: {
        location: { href: postUrl, origin: 'https://www.reddit.com' },
        setInterval: () => 1,
        clearInterval: () => undefined,
        setTimeout,
      },
      chrome: {
        runtime: { onMessage: { addListener() {} }, getManifest: () => manifest },
        storage: {
          local: { async get() { return {} }, async set() {}, async remove() {} },
          sync: { async get() { return {} } },
        },
      },
    }
    runInNewContext(commonScript, context)
    runInNewContext(contentScript, context)

    const captured = (context as unknown as {
      BuyerWatchCapture: { capture: () => Record<string, unknown> }
    }).BuyerWatchCapture.capture()
    expect(captured).toMatchObject({
      platform: 'reddit',
      sourceEventId: 'abc123',
      url: postUrl,
      title: 'How do I find my first customers?',
      text: 'I need a reliable way to find my first ten customers.',
      author: 'founder-example',
      community: 'SaaS',
      publishedAt: '2026-08-01T09:30:00.000Z',
    })
  })

  it('refuses subreddit listings and arbitrary page content', () => {
    const listingUrl = 'https://www.reddit.com/r/SaaS/'
    const document = {
      querySelector: (selector: string) => selector === 'link[rel="canonical"]'
        ? { href: listingUrl }
        : null,
      querySelectorAll: () => [{
        id: 'unrelated',
        innerText: 'A listing page with plenty of unrelated text that must never be captured.',
        getAttribute: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
      }],
    }
    const context = {
      AbortController,
      Date,
      Promise,
      URL,
      clearTimeout,
      setTimeout,
      document,
      window: {
        location: { href: listingUrl, origin: 'https://www.reddit.com' },
        setInterval: () => 1,
        clearInterval: () => undefined,
        setTimeout,
      },
      chrome: {
        runtime: { onMessage: { addListener() {} }, getManifest: () => manifest },
        storage: {
          local: { async get() { return {} }, async set() {}, async remove() {} },
          sync: { async get() { return {} } },
        },
      },
    }
    runInNewContext(commonScript, context)
    runInNewContext(contentScript, context)

    expect((context as unknown as {
      BuyerWatchCapture: { capture: () => Record<string, unknown> }
    }).BuyerWatchCapture.capture()).toEqual({ error: 'unsupported_site' })
  })

  it('retries reply confirmation until the server acknowledges it', async () => {
    const postUrl = 'https://www.reddit.com/r/SaaS/comments/abc123/example/'
    const commentUrl = `${postUrl}reply789/`
    const replyText = 'This is a deliberately unique approved reply for retry verification.'
    const intervalCallbacks: Array<() => void> = []
    const removed: string[] = []
    let cleared = 0
    let attempts = 0
    let now = Date.now()
    class TestDate extends Date {
      static now() { return now }
    }
    const comment = {
      textContent: replyText,
      getAttribute: (name: string) => name === 'permalink' ? commentUrl : null,
      querySelectorAll: () => [],
    }
    const document = {
      querySelector: () => null,
      querySelectorAll: (selector: string) => selector === 'shreddit-comment' ? [comment] : [],
    }
    const context = {
      AbortController,
      Date: TestDate,
      Promise,
      URL,
      clearTimeout,
      setTimeout,
      document,
      window: {
        location: { href: postUrl, origin: 'https://www.reddit.com' },
        setInterval(callback: () => void) {
          intervalCallbacks.push(callback)
          return intervalCallbacks.length
        },
        clearInterval() { cleared += 1 },
        setTimeout,
      },
      chrome: {
        runtime: { onMessage: { addListener() {} }, getManifest: () => manifest },
        storage: {
          local: {
            async get() { return {} },
            async set() {},
            async remove(key: string) { removed.push(key) },
          },
          sync: { async get() { return {} } },
        },
      },
    }
    runInNewContext(commonScript, context)
    runInNewContext(contentScript, context)
    const runtime = context as unknown as {
      BuyerWatchExtensionCommon: {
        fetchWithTimeout: () => Promise<{ ok: boolean; status: number }>
        getAppUrl: () => Promise<string>
        getValidSession: () => Promise<{ access_token: string }>
      }
      BuyerWatchReplyAssist: {
        watchForConfirmation: (
          pending: { threadId: string; text: string; postUrl: string; expiresAt: number },
        ) => number
      }
    }
    runtime.BuyerWatchExtensionCommon.getValidSession = async () => ({ access_token: 'token' })
    runtime.BuyerWatchExtensionCommon.getAppUrl = async () => 'https://buyerwatch.co'
    runtime.BuyerWatchExtensionCommon.fetchWithTimeout = async () => {
      attempts += 1
      return { ok: attempts >= 2, status: attempts >= 2 ? 200 : 503 }
    }

    runtime.BuyerWatchReplyAssist.watchForConfirmation({
      threadId: 'b7b1209a-a5d3-4abc-8d82-f310b8594ed8',
      text: replyText,
      postUrl,
      expiresAt: now + 60_000,
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(attempts).toBe(1)
    expect(removed).toEqual([])

    now += 2_000
    intervalCallbacks[0]()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(attempts).toBe(2)
    expect(removed).toEqual(['buyerwatchPendingReply'])
    expect(cleared).toBe(1)
  })

  it('tracks user edits so reply confirmation records the final submitted text', async () => {
    const postUrl = 'https://www.reddit.com/r/SaaS/comments/abc123/example/'
    const stored: unknown[] = []
    let inputListener: () => void = () => undefined
    const composer = {
      value: 'Original approved draft',
      addEventListener(type: string, listener: () => void) {
        if (type === 'input') inputListener = listener
      },
    }
    const context = {
      AbortController,
      Date,
      Promise,
      URL,
      clearTimeout,
      setTimeout,
      document: { querySelector: () => null, querySelectorAll: () => [] },
      window: {
        location: { href: postUrl, origin: 'https://www.reddit.com' },
        setInterval: () => 1,
        clearInterval: () => undefined,
        setTimeout,
      },
      chrome: {
        runtime: { onMessage: { addListener() {} }, getManifest: () => manifest },
        storage: {
          local: {
            async get() { return {} },
            async set(value: unknown) { stored.push(value) },
            async remove() {},
          },
          sync: { async get() { return {} } },
        },
      },
    }
    runInNewContext(commonScript, context)
    runInNewContext(contentScript, context)
    const runtime = context as unknown as {
      BuyerWatchReplyAssist: {
        trackComposerText: (
          target: typeof composer,
          pending: { text: string },
        ) => () => void
      }
    }
    const pending = { text: 'Original approved draft' }
    runtime.BuyerWatchReplyAssist.trackComposerText(composer, pending)
    composer.value = 'Edited final reply written by the user'
    inputListener()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(pending.text).toBe('Edited final reply written by the user')
    expect(stored.at(-1)).toEqual({ buyerwatchPendingReply: pending })

    composer.value = ''
    inputListener()
    expect(pending.text).toBe('Edited final reply written by the user')
  })

  it('persists an awaiting-analysis opportunity before optional dispatch', () => {
    expect(ingestRoute).toContain(".from('monitored_threads')")
    expect(ingestRoute).toContain("score_reasoning: 'Awaiting analysis'")
    expect(ingestRoute).toContain("automation_reason: 'analysis_pending'")
    expect(ingestRoute).toContain("status: 'awaiting_analysis'")
    expect(ingestRoute).toContain('const canDispatch = Boolean(')
    expect(ingestRoute).toContain("publishQStashJson('/api/jobs/score'")
  })

  it('extracts and persists Reddit publication time instead of capture time', () => {
    expect(contentScript).toContain("'created-timestamp'")
    expect(contentScript).toContain("'faceplate-timeago[ts], time[datetime]'")
    expect(contentScript).toContain('publishedAt: details.publishedAt || undefined')
    expect(ingestRoute).toContain('body.publishedAt')
    expect(ingestRoute).toContain('source_created_at: sourceCreatedAt')
    expect(ingestRoute).toContain('createdAt: sourceCreatedAt')
  })

  it('keeps reply confirmations bound to the original Reddit post', () => {
    expect(replyStatusRoute).toContain(".select('id, platform, status, url, reply_analytics(draft_text)')")
    expect(replyStatusRoute).toContain("extensionSourceIdentity('reddit', thread.url)")
    expect(replyStatusRoute).toContain("error: 'reply_permalink_mismatch'")
  })

  it('does not mistake an unscored capture for a paid AI checkpoint', () => {
    expect(scoreHandler).toContain('const hasScoringCheckpoint = Boolean(')
    expect(scoreHandler).toContain('existing.intent_score !== null')
    expect(scoreHandler).toContain('if (!hasScoringCheckpoint)')
  })
})
