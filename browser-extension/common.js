const BuyerWatchExtensionCommon = (() => {
  const DEFAULT_APP_URL = 'https://buyerwatch.co'
  const DEFAULT_TIMEOUT_MS = 10_000
  const SUPABASE_HOST = 'nenarlpygxtkdxbjqrtb.supabase.co'
  const REDDIT_HOST = /(^|\.)reddit\.com$/i
  const REDDIT_POST_PATH = /^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/[^/?#]*){0,2}\/?$/i

  const clean = (value) => String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  function normalizeAppUrl(value) {
    const raw = String(value || DEFAULT_APP_URL).trim().replace(/\/+$/, '')
    const candidate = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(raw)
      ? `http://${raw}`
      : /^https?:\/\//i.test(raw)
        ? raw
        : `https://${raw}`
    const parsed = new URL(candidate)
    const hostname = parsed.hostname.toLowerCase()
    const isProduction = parsed.protocol === 'https:'
      && (hostname === 'buyerwatch.co' || hostname === 'www.buyerwatch.co')
      && !parsed.port
    const isLocal = parsed.protocol === 'http:'
      && (hostname === 'localhost' || hostname === '127.0.0.1')
      && parsed.port === '3000'
    if (
      (!isProduction && !isLocal)
      || parsed.username
      || parsed.password
      || (parsed.pathname !== '/' && parsed.pathname !== '')
      || parsed.search
      || parsed.hash
    ) {
      throw new Error('invalid_app_url')
    }
    return parsed.origin
  }

  function parseRedditPostUrl(value) {
    try {
      const url = new URL(value)
      if (
        url.protocol !== 'https:'
        || !REDDIT_HOST.test(url.hostname)
        || url.username
        || url.password
        || url.port
      ) return null
      const match = url.pathname.match(REDDIT_POST_PATH)
      if (!match) return null
      url.search = ''
      url.hash = ''
      return {
        postId: match[1].toLowerCase(),
        url: url.toString(),
      }
    } catch {
      return null
    }
  }

  function isUuid(value) {
    return typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  }

  function withTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS) {
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('request_timeout')), timeoutMs)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }

  async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) throw new Error('request_timeout')
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async function getAppUrl() {
    const developmentBuild = chrome.runtime.getManifest().host_permissions
      ?.some(permission => permission.startsWith('http://localhost'))
    if (!developmentBuild) return DEFAULT_APP_URL
    const { appUrl } = await chrome.storage.sync.get('appUrl')
    return normalizeAppUrl(appUrl)
  }

  async function getConfig() {
    const appUrl = await getAppUrl()
    const response = await fetchWithTimeout(`${appUrl}/api/extension/config`)
    if (!response.ok) throw new Error('extension_auth_unavailable')
    const payload = await response.json()
    const supabaseUrl = new URL(payload.supabaseUrl)
    if (
      supabaseUrl.protocol !== 'https:'
      || supabaseUrl.hostname.toLowerCase() !== SUPABASE_HOST
      || supabaseUrl.username
      || supabaseUrl.password
      || supabaseUrl.port
      || (supabaseUrl.pathname !== '/' && supabaseUrl.pathname !== '')
      || typeof payload.supabaseAnonKey !== 'string'
      || !payload.supabaseAnonKey
      || payload.supabaseAnonKey.length > 10_000
    ) {
      throw new Error('extension_auth_unavailable')
    }
    return {
      appUrl,
      supabaseUrl: supabaseUrl.origin,
      supabaseAnonKey: payload.supabaseAnonKey,
    }
  }

  async function refreshSession(config, session) {
    const response = await fetchWithTimeout(
      `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          apikey: config.supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      },
    )
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        // Supabase rotates refresh tokens. Another extension context may have
        // completed a refresh while this request was in flight, so prefer that
        // newer session instead of deleting it after a stale-token response.
        for (const delay of [0, 150, 500]) {
          if (delay) await new Promise(resolve => setTimeout(resolve, delay))
          const { buyerwatchSession: latest } = await chrome.storage.local.get('buyerwatchSession')
          if (
            latest?.refresh_token
            && latest.refresh_token !== session.refresh_token
            && latest.access_token
            && Number(latest.expires_at || 0) > Math.floor(Date.now() / 1000) + 30
          ) {
            return latest
          }
        }
        const { buyerwatchSession: latest } = await chrome.storage.local.get('buyerwatchSession')
        if (!latest || latest.refresh_token === session.refresh_token) {
          await chrome.storage.local.remove('buyerwatchSession')
        }
      }
      throw new Error(response.status === 400 || response.status === 401
        ? 'session_expired'
        : 'session_refresh_failed')
    }
    const payload = await response.json()
    if (
      typeof payload.access_token !== 'string'
      || typeof payload.refresh_token !== 'string'
      || typeof payload.expires_in !== 'number'
      || typeof payload.user?.id !== 'string'
    ) {
      throw new Error('session_refresh_failed')
    }
    const refreshed = {
      ...payload,
      expires_at: Math.floor(Date.now() / 1000) + payload.expires_in,
    }
    await chrome.storage.local.set({ buyerwatchSession: refreshed })
    return refreshed
  }

  async function getValidSession(options = {}) {
    const { buyerwatchSession } = await chrome.storage.local.get('buyerwatchSession')
    if (!buyerwatchSession?.access_token || !buyerwatchSession?.refresh_token) return null
    const expiresSoon = Number(buyerwatchSession.expires_at || 0)
      < Math.floor(Date.now() / 1000) + 60
    if (!options.forceRefresh && !expiresSoon) return buyerwatchSession
    const config = options.config || await getConfig()
    return refreshSession(config, buyerwatchSession)
  }

  return {
    DEFAULT_APP_URL,
    clean,
    fetchWithTimeout,
    getAppUrl,
    getConfig,
    getValidSession,
    isUuid,
    normalizeAppUrl,
    parseRedditPostUrl,
    refreshSession,
    withTimeout,
  }
})()

globalThis.BuyerWatchExtensionCommon = BuyerWatchExtensionCommon
