import { Hyperbrowser, HyperbrowserError } from '@hyperbrowser/sdk'
import { chromium, type Browser, type Page } from 'playwright-core'
import {
  normalizeRedditUsername,
  parseRedditPostTarget,
  type RedditPostTarget,
} from './redditapis-contract'
import { AUTO_REPLY_MAX_AGE_MS, evaluateContentFreshness } from './content-freshness'
import { recordHyperbrowserHealth } from './reddit-delivery-health'
import { redis } from './redis'
import { withRedisLock } from './redis-lock'

const SESSION_TIMEOUT_MINUTES = 5
const NAVIGATION_TIMEOUT_MS = 45_000
const UI_TIMEOUT_MS = 15_000
const SESSION_LOCK_KEY = 'lock:hyperbrowser-reddit-session:v1'
const SESSION_LOCK_TTL_MS = 6 * 60_000

export type HyperbrowserRedditPostSnapshot = {
  id: string
  author: string
  subreddit: string
  createdAt: string | null
  locked: boolean
  stickied: boolean
  over18: boolean
}

export type HyperbrowserRedditAccountProfile = {
  createdAt: string
  linkKarma: number
  commentKarma: number
}

export class HyperbrowserRedditError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly deliveryUncertain = false,
    public readonly reauthRequired = false,
  ) {
    super(code)
    this.name = 'HyperbrowserRedditError'
  }
}

export function isHyperbrowserProfileId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

export function getHyperbrowserSessionOptions(profileId: string) {
  if (!isHyperbrowserProfileId(profileId)) {
    throw new HyperbrowserRedditError('hyperbrowser_profile_invalid', false)
  }
  return {
    useUltraStealth: false,
    useStealth: false,
    useProxy: false,
    solveCaptchas: false,
    adblock: false,
    trackers: false,
    annoyances: false,
    enableWebRecording: false,
    enableVideoWebRecording: false,
    enableLogCapture: false,
    acceptCookies: false,
    saveDownloads: false,
    disablePasswordManager: true,
    timeoutMinutes: SESSION_TIMEOUT_MINUTES,
    profile: {
      id: profileId.trim(),
      // Reddit can rotate authentication cookies. Persisting the rotation keeps
      // the server-side profile usable without storing those cookies here.
      persistChanges: true,
    },
  } as const
}

function getClient(): Hyperbrowser {
  const apiKey = process.env.HYPERBROWSER_API_KEY?.trim()
  if (!apiKey) throw new HyperbrowserRedditError('hyperbrowser_not_configured', false)
  return new Hyperbrowser({ apiKey })
}

function providerFailure(error: unknown): HyperbrowserRedditError {
  if (error instanceof HyperbrowserRedditError) return error
  if (error instanceof HyperbrowserError) {
    const providerAuthenticationFailed = error.statusCode === 401 || error.statusCode === 403
    const creditsExhausted = error.statusCode === 402
    return new HyperbrowserRedditError(
      providerAuthenticationFailed
        ? 'hyperbrowser_authentication_failed'
        : creditsExhausted
          ? 'hyperbrowser_credits_exhausted'
          : 'hyperbrowser_session_unavailable',
      !providerAuthenticationFailed
        && !creditsExhausted
        && (error.retryable || error.statusCode === 429 || (error.statusCode ?? 0) >= 500),
      false,
      false,
    )
  }
  return new HyperbrowserRedditError('hyperbrowser_session_unavailable', true)
}

async function withRedditPage<T>(
  profileId: string,
  operation: (page: Page) => Promise<T>,
): Promise<T> {
  try {
    const result = await withRedisLock(redis, SESSION_LOCK_KEY, SESSION_LOCK_TTL_MS, async () => {
      const client = getClient()
      let sessionId: string | null = null
      let browser: Browser | null = null
      try {
        const session = await client.sessions.create(getHyperbrowserSessionOptions(profileId))
        sessionId = session.id
        browser = await chromium.connectOverCDP(session.wsEndpoint, {
          timeout: NAVIGATION_TIMEOUT_MS,
        })
        const context = browser.contexts()[0]
        if (!context) throw new HyperbrowserRedditError('hyperbrowser_browser_context_missing', true)
        const page = context.pages()[0] ?? await context.newPage()
        page.setDefaultTimeout(UI_TIMEOUT_MS)
        page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS)
        const value = await operation(page)
        await recordHyperbrowserHealth({ status: 'ok' }).catch(() => undefined)
        return value
      } finally {
        await browser?.close().catch(() => undefined)
        if (sessionId) await client.sessions.stop(sessionId).catch(() => undefined)
      }
    })
    if (result === null) throw new HyperbrowserRedditError('hyperbrowser_session_busy', true)
    return result
  } catch (error) {
    throw providerFailure(error)
  }
}

export async function fetchHyperbrowserCreditInfo() {
  try {
    return await getClient().team.getCreditInfo()
  } catch (error) {
    throw providerFailure(error)
  }
}

export function parseRedditProfileUsername(href: unknown): string | null {
  if (typeof href !== 'string') return null
  const match = /^\/user\/([^/]+)\/?$/i.exec(href.trim())
  if (!match) return null
  try {
    return normalizeRedditUsername(decodeURIComponent(match[1]))
  } catch {
    return null
  }
}

async function verifyRedditIdentity(page: Page, expectedUsername: string): Promise<void> {
  const username = normalizeRedditUsername(expectedUsername)
  if (!username) throw new HyperbrowserRedditError('reddit_username_invalid', false)

  const profileLinks = page
    .locator('a[href^="/user/"]')
    .filter({ hasText: /View Profile/i })
  const readVisibleUsernames = async () => {
    const hrefs = await profileLinks.evaluateAll(elements => elements.map(
      element => (element as { getAttribute(name: string): string | null })
        .getAttribute('href'),
    )).catch(() => [])
    return hrefs
      .map(parseRedditProfileUsername)
      .filter((value): value is string => Boolean(value))
  }

  let visibleUsernames = await readVisibleUsernames()
  if (visibleUsernames.length === 0) {
    const menuButton = page
      .locator('button')
      .filter({ hasText: 'Expand user menu', visible: true })
      .first()
    if (!await menuButton.isVisible().catch(() => false)) {
      throw new HyperbrowserRedditError('reddit_reconnect_required', false, false, true)
    }
    // Reddit occasionally schedules background SPA navigation from this
    // control. The menu is already open once the click dispatches, so waiting
    // for that unrelated navigation can turn a successful click into a timeout.
    await menuButton.click({ noWaitAfter: true })
    await profileLinks.first().waitFor({ state: 'attached' }).catch(() => {
      throw new HyperbrowserRedditError('reddit_reconnect_required', false, false, true)
    })
    visibleUsernames = await readVisibleUsernames()
  }

  if (visibleUsernames.length === 0) {
    throw new HyperbrowserRedditError('reddit_reconnect_required', false, false, true)
  }
  if (!visibleUsernames.some(value => value.toLowerCase() === username.toLowerCase())) {
    throw new HyperbrowserRedditError('reddit_account_identity_mismatch', false, false, true)
  }
}

function booleanAttribute(attributes: Record<string, string>, names: string[]): boolean {
  for (const name of names) {
    if (!(name in attributes)) continue
    const value = attributes[name].trim().toLowerCase()
    return value !== 'false' && value !== '0'
  }
  return false
}

export function parseShredditPostAttributes(
  attributes: Record<string, string>,
): HyperbrowserRedditPostSnapshot | null {
  const id = (attributes.id ?? attributes['post-id'] ?? '').trim().replace(/^t3_/i, '').toLowerCase()
  const subreddit = (attributes['subreddit-prefixed-name'] ?? attributes['subreddit-name'] ?? '')
    .trim()
    .replace(/^r\//i, '')
  const author = (attributes.author ?? '').trim().replace(/^u\//i, '')
  const rawCreatedAt = (attributes['created-timestamp'] ?? attributes['created-at'] ?? '').trim()
  const createdAt = rawCreatedAt && Number.isFinite(Date.parse(rawCreatedAt))
    ? new Date(rawCreatedAt).toISOString()
    : null

  if (!/^[a-z0-9]{5,12}$/i.test(id) || !/^[a-z0-9_]{2,50}$/i.test(subreddit) || !author) {
    return null
  }
  return {
    id,
    author,
    subreddit,
    createdAt,
    locked: booleanAttribute(attributes, ['is-locked', 'locked']),
    stickied: booleanAttribute(attributes, ['is-stickied', 'stickied']),
    over18: booleanAttribute(attributes, ['is-nsfw', 'over-18', 'over18']),
  }
}

async function readPostSnapshot(page: Page, target: RedditPostTarget) {
  const post = page.locator(`shreddit-post[id="t3_${target.postId}" i]`).first()
  await post.waitFor({ state: 'attached' })
  const attributes = await post.evaluate((element: {
    getAttributeNames(): string[]
    getAttribute(name: string): string | null
  }) => Object.fromEntries(
    element.getAttributeNames().map(name => [name, element.getAttribute(name) ?? '']),
  ))
  const snapshot = parseShredditPostAttributes(attributes)
  if (!snapshot) throw new HyperbrowserRedditError('reddit_post_snapshot_invalid', false)
  if (
    snapshot.id !== target.postId
    || snapshot.subreddit.toLowerCase() !== target.subreddit.toLowerCase()
  ) throw new HyperbrowserRedditError('reddit_post_identity_mismatch', false)
  return snapshot
}

async function openRedditPost(page: Page, target: RedditPostTarget, username: string) {
  await page.goto(target.canonicalUrl, { waitUntil: 'domcontentloaded' })
  await verifyRedditIdentity(page, username)
  return readPostSnapshot(page, target)
}

export async function fetchHyperbrowserRedditPostSnapshot(input: {
  postUrl: string
  username: string
  profileId: string
}): Promise<HyperbrowserRedditPostSnapshot> {
  const target = parseRedditPostTarget(input.postUrl)
  if (!target) throw new HyperbrowserRedditError('reddit_post_url_invalid', false)
  return withRedditPage(input.profileId, page => openRedditPost(page, target, input.username))
}

export async function fetchHyperbrowserRedditAccountProfile(input: {
  username: string
  profileId: string
}): Promise<HyperbrowserRedditAccountProfile> {
  const username = normalizeRedditUsername(input.username)
  if (!username) throw new HyperbrowserRedditError('reddit_username_invalid', false)
  return withRedditPage(input.profileId, async (page) => {
    await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' })
    await verifyRedditIdentity(page, username)
    const payload = await page.evaluate(async requestedUsername => {
      const response = await fetch(`/user/${encodeURIComponent(requestedUsername)}/about.json`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) return null
      return response.json() as Promise<unknown>
    }, username)
    const data = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as { data?: unknown }).data
      : null
    const profile = data && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, unknown>
      : null
    const returnedUsername = normalizeRedditUsername(profile?.name)
    const createdUtc = Number(profile?.created_utc)
    const linkKarma = Number(profile?.link_karma)
    const commentKarma = Number(profile?.comment_karma)
    if (
      !returnedUsername
      || returnedUsername.toLowerCase() !== username.toLowerCase()
      || !Number.isFinite(createdUtc)
      || !Number.isSafeInteger(linkKarma)
      || !Number.isSafeInteger(commentKarma)
    ) throw new HyperbrowserRedditError('reddit_account_safety_profile_unavailable', false)
    return {
      createdAt: new Date(createdUtc * 1_000).toISOString(),
      linkKarma,
      commentKarma,
    }
  })
}

function confirmedCommentPermalink(
  href: string | null,
  target: RedditPostTarget,
): string | null {
  if (!href) return null
  try {
    const url = new URL(href, 'https://www.reddit.com')
    if (
      url.protocol !== 'https:'
      || !['reddit.com', 'www.reddit.com'].includes(url.hostname.toLowerCase())
      || !url.pathname.toLowerCase().includes(`/comments/${target.postId}/`)
    ) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export async function postHyperbrowserRedditReply(input: {
  postUrl: string
  text: string
  username: string
  profileId: string
  triggerType: 'manual' | 'auto'
}): Promise<{ permalink: string }> {
  const target = parseRedditPostTarget(input.postUrl)
  const username = normalizeRedditUsername(input.username)
  const text = input.text.trim()
  if (!target || !username || !text || text.length > 10_000) {
    throw new HyperbrowserRedditError('reddit_reply_invalid', false)
  }

  return withRedditPage(input.profileId, async (page) => {
    const snapshot = await openRedditPost(page, target, username)
    if (snapshot.locked) throw new HyperbrowserRedditError('reddit_post_locked', false)
    if (snapshot.author.toLowerCase() === username.toLowerCase()) {
      throw new HyperbrowserRedditError('reddit_self_reply_blocked', false)
    }
    if (
      snapshot.author === '[deleted]'
      || snapshot.author.toLowerCase() === 'automoderator'
    ) throw new HyperbrowserRedditError('reddit_non_actionable_author', false)
    if (input.triggerType === 'auto' && snapshot.stickied) {
      throw new HyperbrowserRedditError('reddit_stickied_post_requires_review', false)
    }
    if (input.triggerType === 'auto' && snapshot.over18) {
      throw new HyperbrowserRedditError('reddit_nsfw_post_requires_review', false)
    }
    if (input.triggerType === 'auto') {
      const freshness = evaluateContentFreshness(snapshot.createdAt, {
        maxAgeMs: AUTO_REPLY_MAX_AGE_MS,
      })
      if (freshness.fresh === false) {
        throw new HyperbrowserRedditError(
          freshness.reason === 'source_too_old'
            ? 'reddit_post_outside_reply_window'
            : 'reddit_post_age_unverified',
          false,
        )
      }
    }

    const composer = page
      .locator('shreddit-composer[placeholder="Join the conversation"]')
      .filter({ visible: true })
      .first()
    if (!await composer.isVisible().catch(() => false)) {
      const trigger = page
        .locator('faceplate-textarea-input[data-testid="trigger-button"]')
        .filter({ visible: true })
        .first()
      try {
        await trigger.waitFor({ state: 'visible' })
        await trigger.click({ noWaitAfter: true })
        await composer.waitFor({ state: 'visible' })
      } catch {
        throw new HyperbrowserRedditError('reddit_comment_composer_unavailable', true)
      }
    }
    const editor = composer.locator('[role="textbox"], [contenteditable="true"], textarea').first()
    try {
      await editor.fill(text)
    } catch {
      throw new HyperbrowserRedditError('reddit_comment_editor_unavailable', true)
    }
    // Playwright's regex text filter does not match Reddit's slotted button in
    // the current shadow-DOM variant even though its visible label is Comment.
    // The stable slot/type attributes identify the same control directly.
    const submit = composer
      .locator('button[slot="submit-button"][type="submit"], button[type="submit"]')
      .filter({ visible: true })
      .first()
    await submit.waitFor({ state: 'visible' }).catch(() => {
      throw new HyperbrowserRedditError('reddit_comment_submit_unavailable', true)
    })
    if (!await submit.isEnabled()) {
      throw new HyperbrowserRedditError('reddit_comment_submit_unavailable', false)
    }

    let writeStarted = false
    try {
      writeStarted = true
      await submit.click({ noWaitAfter: true })
      const ownComment = page
        .locator(`shreddit-comment[author="${username}" i], [thingid^="t1_"][author="${username}" i]`)
        .filter({ hasText: text })
        .first()
      await ownComment.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS })
      const directPermalink = confirmedCommentPermalink(
        await ownComment.getAttribute('permalink'),
        target,
      )
      if (directPermalink) return { permalink: directPermalink }
      const linkedPermalink = confirmedCommentPermalink(
        await ownComment.locator(`a[href*="/comments/${target.postId}/"]`).first().getAttribute('href'),
        target,
      )
      if (linkedPermalink) return { permalink: linkedPermalink }
      throw new HyperbrowserRedditError('hyperbrowser_delivery_outcome_unknown', false, true)
    } catch (error) {
      if (error instanceof HyperbrowserRedditError) throw error
      throw new HyperbrowserRedditError(
        writeStarted ? 'hyperbrowser_delivery_outcome_unknown' : 'reddit_comment_submit_failed',
        !writeStarted,
        writeStarted,
      )
    }
  })
}
