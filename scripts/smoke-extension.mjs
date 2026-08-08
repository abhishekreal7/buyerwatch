import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const productionMode = process.argv.includes('--production')
const extensionPath = productionMode
  ? join(root, 'browser-extension')
  : join(root, 'tmp', 'buyerwatch-extension-dev')
const appOrigin = productionMode ? 'https://buyerwatch.co' : 'http://localhost:3000'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function extensionIdFromManifestKey(key) {
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest()
  return [...digest.subarray(0, 16)]
    .map(byte => `${String.fromCharCode(97 + (byte >> 4))}${String.fromCharCode(97 + (byte & 15))}`)
    .join('')
}

function removeGeneratedProfile(path) {
  const temporaryRoot = resolve(tmpdir()) + sep
  const target = resolve(path)
  if (!target.startsWith(temporaryRoot) || !target.includes('buyerwatch-extension-smoke-')) {
    throw new Error(`Refusing to remove unsafe profile path: ${target}`)
  }
  rmSync(target, { force: true, recursive: true })
}

async function launch(profilePath) {
  const options = {
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  }
  return chromium.launchPersistentContext(profilePath, {
    ...options,
    channel: 'chromium',
  })
}

if (!existsSync(join(extensionPath, 'manifest.json'))) {
  throw new Error(productionMode
    ? 'Production extension source is missing.'
    : 'Development extension is missing. Run npm run extension:dev first.')
}

const profilePath = await mkdtemp(join(tmpdir(), 'buyerwatch-extension-smoke-'))
let context
try {
  context = await launch(profilePath)
  let worker = context.serviceWorkers()[0]
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 })
  const extensionId = new URL(worker.url()).hostname
  assert(/^[a-p]{32}$/.test(extensionId), 'Chrome did not assign a valid extension ID')
  if (productionMode) {
    const manifest = JSON.parse(readFileSync(join(extensionPath, 'manifest.json'), 'utf8'))
    assert(
      extensionId === extensionIdFromManifestKey(manifest.key),
      'Loaded production extension ID does not match the signed manifest key',
    )
  }

  const reddit = await context.newPage()
  await reddit.route('https://www.reddit.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html>
      <html>
        <head>
          <link rel="canonical" href="https://www.reddit.com/r/SaaS/comments/abc123/need_help/">
        </head>
        <body>
          <shreddit-post
            post-id="abc123"
            post-title="How do I find my first ten customers?"
            author="founder-example"
            subreddit-prefixed-name="r/SaaS"
            created-timestamp="2026-08-01T09:30:00.000Z"
          >
            <div slot="text-body">I need a reliable way to reach buyers without wasting weeks on cold outreach.</div>
          </shreddit-post>
        </body>
      </html>`,
  }))
  const redditUrl = 'https://www.reddit.com/r/SaaS/comments/abc123/need_help/'
  await reddit.goto(redditUrl)
  await reddit.waitForLoadState('domcontentloaded')

  const capture = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return { error: 'test_tab_missing' }
    return chrome.tabs.sendMessage(tab.id, { type: 'BUYERWATCH_CAPTURE' })
  })
  assert(
    capture?.sourceEventId === 'abc123',
    `Reddit content script did not capture the exact post: ${JSON.stringify(capture)}`,
  )
  assert(capture?.publishedAt === '2026-08-01T09:30:00.000Z', 'Publication time was not preserved')

  const buyerwatch = await context.newPage()
  await buyerwatch.route(`${appOrigin}/**`, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body>BuyerWatch extension smoke test</body></html>',
  }))
  await buyerwatch.goto(`${appOrigin}/extension-smoke`)
  const sendExternal = (message) => buyerwatch.evaluate(({ id, payload }) => (
    new Promise((resolve) => {
      if (typeof globalThis.chrome?.runtime?.sendMessage !== 'function') {
        resolve({ success: false, error: 'runtime_unavailable' })
        return
      }
      globalThis.chrome.runtime.sendMessage(id, payload, (response) => {
        const error = globalThis.chrome.runtime.lastError?.message
        resolve(error ? { success: false, error } : response)
      })
    })
  ), { id: extensionId, payload: message })

  const ping = await sendExternal({ type: 'BUYERWATCH_EXTENSION_PING' })
  assert(ping?.success === true, `Restricted external ping failed: ${ping?.error || 'unknown error'}`)

  const threadId = 'b7b1209a-a5d3-4abc-8d82-f310b8594ed8'
  const prepared = await sendExternal({
    type: 'BUYERWATCH_PREPARE_REPLY',
    reply: {
      threadId,
      text: 'A reviewed reply that Chrome should store without submitting.',
      postUrl: `${redditUrl}?utm_source=smoke`,
    },
  })
  assert(prepared?.success === true, 'External reply preparation failed')
  const pending = await worker.evaluate(async () => (
    (await chrome.storage.local.get('buyerwatchPendingReply')).buyerwatchPendingReply
  ))
  assert(pending?.threadId === threadId, 'Pending reply was not stored by the service worker')
  assert(pending?.postUrl === redditUrl, 'Pending reply URL was not canonicalized')

  console.log(`[extension-smoke] PASS ${productionMode ? 'production' : 'development'} ${extensionId}: manifest, service worker, external messaging, capture, and local storage.`)
} finally {
  await context?.close().catch(() => undefined)
  removeGeneratedProfile(profilePath)
}
