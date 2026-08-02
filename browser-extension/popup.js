const DEFAULT_APP_URL = 'https://buyerwatch.co'

const views = {
  loading: document.querySelector('#loading-view'),
  login: document.querySelector('#login-view'),
  capture: document.querySelector('#capture-view'),
}
const statusMessage = document.querySelector('#status-message')
const loginStatus = document.querySelector('#login-status')
const captureButton = document.querySelector('#capture-button')

function normalizeAppUrl(value) {
  const raw = String(value || DEFAULT_APP_URL).trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(raw)) return `http://${raw}`
  return `https://${raw}`
}

function showView(name) {
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle('hidden', key !== name)
  })
}

function setStatus(message, tone = '') {
  statusMessage.textContent = message
  statusMessage.className = `status-message ${tone}`.trim()
}

async function getAppUrl() {
  const { appUrl } = await chrome.storage.sync.get('appUrl')
  return normalizeAppUrl(appUrl)
}

async function getConfig() {
  const appUrl = await getAppUrl()
  const response = await fetch(`${appUrl}/api/extension/config`)
  if (!response.ok) throw new Error('BuyerWatch authentication is unavailable.')
  return { appUrl, ...await response.json() }
}

async function refreshSession(config, session) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  })
  if (!response.ok) {
    await chrome.storage.local.remove('buyerwatchSession')
    return null
  }
  const payload = await response.json()
  const refreshed = {
    ...payload,
    expires_at: Math.floor(Date.now() / 1000) + payload.expires_in,
  }
  await chrome.storage.local.set({ buyerwatchSession: refreshed })
  return refreshed
}

async function getSession(config) {
  const { buyerwatchSession } = await chrome.storage.local.get('buyerwatchSession')
  if (!buyerwatchSession) return null
  const expiresSoon = Number(buyerwatchSession.expires_at || 0) < Math.floor(Date.now() / 1000) + 60
  return expiresSoon ? refreshSession(config, buyerwatchSession) : buyerwatchSession
}

async function signIn(config, email, password) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload.error_description || payload.msg || 'Unable to sign in.'
    if (/invalid login credentials/i.test(message)) {
      throw new Error('If you use Google sign-in, refresh BuyerWatch and reopen this extension.')
    }
    throw new Error(message)
  }
  const session = {
    ...payload,
    expires_at: Math.floor(Date.now() / 1000) + payload.expires_in,
  }
  await chrome.storage.local.set({ buyerwatchSession: session })
  return session
}

function platformForUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.endsWith('reddit.com')) return { id: 'reddit', name: 'Reddit conversation', icon: 'R' }
  } catch {
    return null
  }
  return null
}

async function updateCurrentSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const platform = platformForUrl(tab?.url)
  const icon = document.querySelector('#site-icon')
  const name = document.querySelector('#site-name')
  const detail = document.querySelector('#site-detail')

  if (!platform) {
    icon.textContent = 'BW'
    icon.className = 'site-icon'
    name.textContent = 'Open a Reddit conversation'
    detail.textContent = 'BuyerWatch captures Reddit posts'
    captureButton.disabled = true
    return
  }

  icon.textContent = platform.icon
  icon.className = `site-icon ${platform.id}`
  name.textContent = platform.name
  detail.textContent = new URL(tab.url).hostname
  captureButton.disabled = false
}

function captureErrorMessage(error) {
  const messages = {
    unsupported_site: 'Open a Reddit conversation first.',
    conversation_not_found: 'BuyerWatch could not find the conversation on this page.',
    no_matching_keyword: 'This conversation does not match an active monitoring rule.',
    invalid_capture: 'The page did not contain a valid conversation.',
    invalid_source_url: 'This source URL is not supported.',
    origin_not_allowed: 'Add this extension origin to CHROME_EXTENSION_ORIGINS.',
    rate_limited: 'Too many captures. Please wait a moment.',
  }
  return messages[error] || 'The conversation could not be captured.'
}

async function initialize() {
  showView('loading')
  try {
    const config = await getConfig()
    const session = await getSession(config)
    if (!session) {
      showView('login')
      return
    }
    document.querySelector('#account-email').textContent = session.user?.email || 'BuyerWatch account'
    showView('capture')
    await updateCurrentSite()
  } catch (error) {
    showView('login')
    const loginButton = document.querySelector('#login-button')
    loginStatus.textContent = error instanceof Error ? error.message : 'Connection unavailable'
    loginStatus.className = 'status-message error'
    loginButton.disabled = true
  }
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = document.querySelector('#login-button')
  button.disabled = true
  button.textContent = 'Connecting...'
  loginStatus.textContent = ''
  try {
    const config = await getConfig()
    const session = await signIn(
      config,
      document.querySelector('#email').value.trim(),
      document.querySelector('#password').value,
    )
    document.querySelector('#account-email').textContent = session.user?.email || 'BuyerWatch account'
    showView('capture')
    await updateCurrentSite()
  } catch (error) {
    button.disabled = false
    button.textContent = 'Connect BuyerWatch'
    loginStatus.textContent = error instanceof Error ? error.message : 'Unable to sign in.'
    loginStatus.className = 'status-message error'
  }
})

document.querySelector('#logout-button').addEventListener('click', async () => {
  await chrome.storage.local.remove('buyerwatchSession')
  showView('login')
})

document.querySelector('#settings-button').addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

captureButton.addEventListener('click', async () => {
  captureButton.disabled = true
  captureButton.textContent = 'Capturing...'
  setStatus('')
  try {
    const config = await getConfig()
    const session = await getSession(config)
    if (!session) {
      showView('login')
      return
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('unsupported_site')
    const capture = await chrome.tabs.sendMessage(tab.id, { type: 'BUYERWATCH_CAPTURE' })
    if (capture?.error) throw new Error(capture.error)

    const response = await fetch(`${config.appUrl}/api/extension/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(capture),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'capture_failed')

    captureButton.textContent = 'Captured'
    setStatus(
      payload.queued
        ? 'Saved and queued for analysis.'
        : 'Saved. Analysis will begin when AI processing is connected.',
      'success',
    )
  } catch (error) {
    captureButton.disabled = false
    captureButton.textContent = 'Capture conversation'
    setStatus(captureErrorMessage(error instanceof Error ? error.message : ''), 'error')
  }
})

initialize()
