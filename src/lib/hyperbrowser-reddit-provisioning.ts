import 'server-only'

import { chromium, type Browser } from 'playwright-core'
import {
  isHyperbrowserProfileId,
  readAuthenticatedRedditAccount,
  verifyRedditIdentity,
} from './hyperbrowser-reddit'
import { HyperbrowserClient, HyperbrowserClientError } from './hyperbrowser-client'
import {
  getHyperbrowserRedditConnectionForVerification,
  saveHyperbrowserRedditConnection,
} from './reddit-session'

const SIGN_IN_TIMEOUT_MINUTES = 15
const LIVE_VIEW_TTL_SECONDS = SIGN_IN_TIMEOUT_MINUTES * 60
const REDDIT_LOGIN_URL = 'https://www.reddit.com/login/'

export class HyperbrowserRedditProvisioningError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code)
    this.name = 'HyperbrowserRedditProvisioningError'
  }
}

function getClient(): HyperbrowserClient {
  const apiKey = process.env.HYPERBROWSER_API_KEY?.trim()
  if (!apiKey) throw new HyperbrowserRedditProvisioningError('hyperbrowser_not_configured', false)
  return new HyperbrowserClient(apiKey)
}

function asProvisioningError(error: unknown): HyperbrowserRedditProvisioningError {
  if (error instanceof HyperbrowserRedditProvisioningError) return error
  if (error instanceof HyperbrowserClientError) {
    const authFailure = error.statusCode === 401 || error.statusCode === 403
    const creditsExhausted = error.statusCode === 402
    return new HyperbrowserRedditProvisioningError(
      authFailure
        ? 'hyperbrowser_authentication_failed'
        : creditsExhausted
          ? 'hyperbrowser_credits_exhausted'
          : 'hyperbrowser_session_unavailable',
      !authFailure && !creditsExhausted
        && (error.retryable || error.statusCode === 429 || (error.statusCode ?? 0) >= 500),
    )
  }
  return new HyperbrowserRedditProvisioningError('hyperbrowser_session_unavailable', true)
}

export function isTrustedHyperbrowserLiveUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && (url.hostname === 'app.hyperbrowser.ai' || url.hostname.endsWith('.hxproxy.io'))
  } catch {
    return false
  }
}

function validateLiveUrl(value: unknown): string {
  if (!isTrustedHyperbrowserLiveUrl(value)) {
    throw new HyperbrowserRedditProvisioningError('hyperbrowser_live_view_unavailable', true)
  }
  return new URL(value).toString()
}

export async function createHyperbrowserRedditProfile(userId: string): Promise<string> {
  try {
    const profile = await getClient().createProfile(`buyerwatch-reddit-${userId}`)
    if (!isHyperbrowserProfileId(profile.id)) {
      throw new HyperbrowserRedditProvisioningError('hyperbrowser_profile_invalid', false)
    }
    return profile.id
  } catch (error) {
    throw asProvisioningError(error)
  }
}

export async function deleteHyperbrowserRedditProfile(profileId: string): Promise<void> {
  if (!isHyperbrowserProfileId(profileId)) return
  await getClient().deleteProfile(profileId).catch(() => undefined)
}

export async function createHyperbrowserRedditSignInSession(profileId: string): Promise<{
  sessionId: string
  liveUrl: string
}> {
  if (!isHyperbrowserProfileId(profileId)) {
    throw new HyperbrowserRedditProvisioningError('hyperbrowser_profile_invalid', false)
  }

  const client = getClient()
  let sessionId: string | null = null
  try {
    const useProxy = process.env.HYPERBROWSER_USE_PROXY?.trim() === 'true'
    const solveCaptchas = process.env.HYPERBROWSER_SOLVE_CAPTCHAS?.trim() === 'true'
    const sessionOptions: Record<string, unknown> = {
      useUltraStealth: false,
      useStealth: true,
      useProxy,
      ...(useProxy ? { proxyCountry: 'US' } : {}),
      solveCaptchas,
      adblock: false,
      trackers: false,
      annoyances: false,
      // A sign-in session can display credentials. Never record it.
      enableWebRecording: false,
      enableVideoWebRecording: false,
      enableLogCapture: false,
      acceptCookies: false,
      saveDownloads: false,
      disablePasswordManager: true,
      timeoutMinutes: SIGN_IN_TIMEOUT_MINUTES,
      liveViewTtlSeconds: LIVE_VIEW_TTL_SECONDS,
      viewOnlyLiveView: false,
      profile: { id: profileId, persistChanges: true },
    }

    // Clean up any lingering active sessions first to free up the concurrency slot on free/limited plans
    await client.stopAllActiveSessions().catch(() => undefined)

    let createdSession
    try {
      createdSession = await client.createSession(sessionOptions)
    } catch (createErr) {
      // If concurrency limit was hit (429), ensure all active sessions are stopped, wait briefly, and retry
      if (
        createErr instanceof HyperbrowserClientError
        && (createErr.statusCode === 429 || createErr.message?.includes('active sessions'))
      ) {
        console.warn('[hyperbrowser] Concurrency limit hit, stopping active sessions and retrying...')
        await client.stopAllActiveSessions().catch(() => undefined)
        await new Promise(resolve => setTimeout(resolve, 1500))
        createdSession = await client.createSession(sessionOptions)
      } else if (
        (sessionOptions.useProxy || sessionOptions.solveCaptchas)
        && createErr instanceof HyperbrowserClientError
        && (createErr.statusCode === 400 || createErr.statusCode === 402)
      ) {
        // If the Hyperbrowser account does not support managed proxies or solveCaptchas,
        // fall back to direct connection with stealth enabled rather than failing completely.
        console.warn('[hyperbrowser] Proxy/captcha unavailable on current plan, falling back to direct stealth session')
        sessionOptions.useProxy = false
        sessionOptions.solveCaptchas = false
        delete sessionOptions.proxyCountry
        createdSession = await client.createSession(sessionOptions)
      } else {
        throw createErr
      }
    }

    sessionId = createdSession.id

    // Hyperbrowser can return the CDP details immediately while issuing the
    // short-lived live-view URL a moment later. Read it back explicitly with
    // its TTL request so the browser handoff never receives an empty URL.
    const session = await client.getSession(createdSession.id, {
      liveViewTtlSeconds: LIVE_VIEW_TTL_SECONDS,
    })
    if (!session.wsEndpoint) {
      throw new HyperbrowserRedditProvisioningError('hyperbrowser_session_unavailable', true)
    }

    const browser = await chromium.connectOverCDP(session.wsEndpoint, { timeout: 30_000 })
    const context = browser.contexts()[0]
    if (!context) throw new HyperbrowserRedditProvisioningError('hyperbrowser_browser_context_missing', true)
    const page = context.pages()[0] ?? await context.newPage()
    await page.goto(REDDIT_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    return { sessionId: session.id, liveUrl: validateLiveUrl(session.liveUrl) }
  } catch (error) {
    if (sessionId) await client.stopSession(sessionId).catch(() => undefined)
    throw asProvisioningError(error)
  }
}

export async function finishHyperbrowserRedditSignInSession(input: {
  sessionId: string
  profileId: string
}): Promise<void> {
  if (!isHyperbrowserProfileId(input.sessionId) || !isHyperbrowserProfileId(input.profileId)) {
    throw new HyperbrowserRedditProvisioningError('hyperbrowser_session_invalid', false)
  }
  const client = getClient()
  try {
    const session = await client.getSession(input.sessionId)
    if (session.launchState?.profile?.id !== input.profileId) {
      throw new HyperbrowserRedditProvisioningError('hyperbrowser_session_profile_mismatch', false)
    }
    if (session.status === 'active') await client.stopSession(input.sessionId)
  } catch (error) {
    throw asProvisioningError(error)
  }
}

export type ParsedRedditCookie = {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'None' | 'Lax' | 'Strict'
}

export function parseRedditCookies(input: string): ParsedRedditCookie[] {
  const trimmed = input.trim()
  if (!trimmed) return []

  const pairs: Array<{ name: string; value: string }> = []

  // Check if multiple semicolon-separated cookies were pasted
  if (trimmed.includes(';') || (trimmed.includes('=') && !trimmed.startsWith('reddit_session%'))) {
    const parts = trimmed.split(';')
    for (const part of parts) {
      const eqIdx = part.indexOf('=')
      if (eqIdx > 0) {
        const name = part.slice(0, eqIdx).trim()
        const value = part.slice(eqIdx + 1).trim()
        if (name && value) {
          pairs.push({ name, value })
        }
      }
    }
  }

  // If no '=' was found or user pasted only the raw value of reddit_session
  if (pairs.length === 0 && trimmed.length > 5) {
    pairs.push({ name: 'reddit_session', value: trimmed })
  }

  // Normalize single unnamed session value
  if (pairs.length === 1 && pairs[0].name !== 'reddit_session' && pairs[0].value) {
    if (/session/i.test(pairs[0].name)) pairs[0].name = 'reddit_session'
  }

  return pairs.map(p => ({
    name: p.name,
    value: p.value,
    domain: '.reddit.com',
    path: '/',
    httpOnly: p.name === 'reddit_session',
    secure: true,
    sameSite: 'Lax' as const,
  }))
}

export async function importRedditSessionCookieToHyperbrowser(input: {
  userId: string
  cookieInput: string
  expectedUsername?: string
}): Promise<{
  username: string
  createdAt: string
  linkKarma: number
  commentKarma: number
  profileId: string
}> {
  const cookies = parseRedditCookies(input.cookieInput)
  if (cookies.length === 0 || !cookies.some(c => c.name === 'reddit_session' && c.value.length > 5)) {
    throw new HyperbrowserRedditProvisioningError('reddit_session_cookie_invalid', false)
  }

  const client = getClient()
  await client.stopAllActiveSessions().catch(() => undefined)

  // Use existing profile if available, otherwise create a dedicated one
  const existing = await getHyperbrowserRedditConnectionForVerification(input.userId).catch(() => null)
  const profileId = existing?.profileId ?? await createHyperbrowserRedditProfile(input.userId)

  let sessionId: string | null = null
  let browser: Browser | null = null
  try {
    const session = await client.createSession({
      useStealth: true,
      profile: { id: profileId, persistChanges: true },
    })
    sessionId = session.id
    if (!session.wsEndpoint) {
      throw new HyperbrowserRedditProvisioningError('hyperbrowser_session_unavailable', true)
    }

    browser = await chromium.connectOverCDP(session.wsEndpoint, { timeout: 30_000 })
    const context = browser.contexts()[0]
    if (!context) {
      throw new HyperbrowserRedditProvisioningError('hyperbrowser_browser_context_missing', true)
    }

    // Clean old cookies so no stale mismatched credentials linger
    await context.clearCookies().catch(() => undefined)

    // Inject cookies into the profile context
    await context.addCookies(cookies)

    const page = context.pages()[0] ?? await context.newPage()
    page.setDefaultNavigationTimeout(45_000)
    page.setDefaultTimeout(15_000)

    // Navigate to reddit.com directly (never robots.txt which triggers network security blocks)
    await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded', timeout: 35_000 })

    // Read identity from Reddit API
    let account = await readAuthenticatedRedditAccount(page)
    if (!account) {
      // Fallback: Check shreddit-app attribute and visible user elements on the page
      const pageUsername = await page.evaluate(() => {
        const shreddit = document.querySelector('shreddit-app')
        const directUser = shreddit?.getAttribute('current-user-name')
          || shreddit?.getAttribute('username')
        if (directUser) return directUser

        const userLinks = Array.from(document.querySelectorAll('a[href^="/user/"]:not([href*="/comments/"])'))
        for (const link of userLinks) {
          const href = link.getAttribute('href') || ''
          const match = href.match(/\/user\/([A-Za-z0-9_-]+)/i)
          if (match && match[1] && !['Roblox', 'Reddit', 'AutoModerator'].includes(match[1])) {
            return match[1]
          }
        }
        return null
      }).catch(() => null)

      if (pageUsername) {
        account = {
          username: pageUsername,
          createdAt: new Date().toISOString(),
          linkKarma: 1,
          commentKarma: 1,
        }
      }
    }

    if (!account && input.expectedUsername) {
      account = await verifyRedditIdentity(page, input.expectedUsername).catch(() => null)
    }

    if (!account || !account.username) {
      throw new HyperbrowserRedditProvisioningError('reddit_session_cookie_expired_or_invalid', false)
    }

    if (
      input.expectedUsername
      && account.username.toLowerCase() !== input.expectedUsername.trim().toLowerCase().replace(/^u\//i, '')
    ) {
      throw new HyperbrowserRedditProvisioningError('reddit_account_identity_mismatch', false)
    }

    // Close browser & session to commit profile storage to Hyperbrowser disk
    await browser.close().catch(() => undefined)
    browser = null
    await client.stopSession(sessionId).catch(() => undefined)
    sessionId = null

    // Save active connection in Supabase
    await saveHyperbrowserRedditConnection({
      userId: input.userId,
      username: account.username,
      profileId,
      accountCreatedAt: account.createdAt,
      linkKarma: account.linkKarma,
      commentKarma: account.commentKarma,
    })

    return {
      username: account.username,
      createdAt: account.createdAt,
      linkKarma: account.linkKarma,
      commentKarma: account.commentKarma,
      profileId,
    }
  } catch (error) {
    if (browser) await browser.close().catch(() => undefined)
    if (sessionId) await client.stopSession(sessionId).catch(() => undefined)
    throw asProvisioningError(error)
  }
}

