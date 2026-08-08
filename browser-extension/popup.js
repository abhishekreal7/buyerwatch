const views = {
  loading: document.querySelector('#loading-view'),
  login: document.querySelector('#login-view'),
  capture: document.querySelector('#capture-view'),
}
const statusMessage = document.querySelector('#status-message')
const loginStatus = document.querySelector('#login-status')
const captureButton = document.querySelector('#capture-button')

function showView(name) {
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle('hidden', key !== name)
  })
}

function setStatus(message, tone = '') {
  statusMessage.textContent = message
  statusMessage.className = `status-message ${tone}`.trim()
}

async function getSession(config) {
  try {
    return await BuyerWatchExtensionCommon.getValidSession({ config })
  } catch (error) {
    if (error instanceof Error && error.message === 'session_expired') return null
    throw error
  }
}

async function signIn(config, email, password) {
  const response = await BuyerWatchExtensionCommon.fetchWithTimeout(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
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
  if (
    typeof payload.access_token !== 'string'
    || typeof payload.refresh_token !== 'string'
    || typeof payload.expires_in !== 'number'
    || typeof payload.user?.id !== 'string'
  ) {
    throw new Error('BuyerWatch returned an invalid session. Please try again.')
  }
  const session = {
    ...payload,
    expires_at: Math.floor(Date.now() / 1000) + payload.expires_in,
  }
  await chrome.storage.local.set({ buyerwatchSession: session })
  return session
}

function platformForUrl(url) {
  return BuyerWatchExtensionCommon.parseRedditPostUrl(url)
    ? { id: 'reddit', name: 'Reddit conversation', icon: 'R' }
    : null
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
    request_timeout: 'The request timed out. Check your connection and try again.',
    receiving_end_missing: 'Refresh the Reddit tab, then try capturing again.',
    session_expired: 'Your BuyerWatch session expired. Sign in again to continue.',
    source_identity_mismatch: 'Reddit returned an inconsistent post URL. Refresh the page and retry.',
  }
  return messages[error] || 'The conversation could not be captured.'
}

async function initialize() {
  showView('loading')
  try {
    const config = await BuyerWatchExtensionCommon.getConfig()
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
    const message = error instanceof Error ? error.message : ''
    loginStatus.textContent = message === 'request_timeout'
      ? 'BuyerWatch took too long to respond. Reopen the extension to retry.'
      : message === 'extension_auth_unavailable'
        ? 'BuyerWatch authentication is temporarily unavailable.'
        : message || 'Connection unavailable'
    loginStatus.className = 'status-message error'
    loginButton.disabled = false
  }
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = document.querySelector('#login-button')
  button.disabled = true
  button.textContent = 'Connecting...'
  loginStatus.textContent = ''
  try {
    const config = await BuyerWatchExtensionCommon.getConfig()
    const session = await signIn(
      config,
      document.querySelector('#email').value.trim(),
      document.querySelector('#password').value,
    )
    document.querySelector('#password').value = ''
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
  try {
    const config = await BuyerWatchExtensionCommon.getConfig()
    const { buyerwatchSession } = await chrome.storage.local.get('buyerwatchSession')
    if (buyerwatchSession?.access_token) {
      await BuyerWatchExtensionCommon.fetchWithTimeout(`${config.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${buyerwatchSession.access_token}`,
        },
      }).catch(() => undefined)
    }
  } finally {
    await chrome.storage.local.remove(['buyerwatchSession', 'buyerwatchPendingReply'])
    showView('login')
  }
})

document.querySelector('#settings-button').addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

captureButton.addEventListener('click', async () => {
  captureButton.disabled = true
  captureButton.textContent = 'Capturing...'
  setStatus('')
  try {
    const config = await BuyerWatchExtensionCommon.getConfig()
    const session = await getSession(config)
    if (!session) {
      showView('login')
      return
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('unsupported_site')
    let capture
    try {
      capture = await BuyerWatchExtensionCommon.withTimeout(
        chrome.tabs.sendMessage(tab.id, { type: 'BUYERWATCH_CAPTURE' }),
        5_000,
      )
    } catch (error) {
      if (/receiving end does not exist/i.test(String(error))) {
        throw new Error('receiving_end_missing')
      }
      throw error
    }
    if (capture?.error) throw new Error(capture.error)

    const ingest = activeSession => BuyerWatchExtensionCommon.fetchWithTimeout(
      `${config.appUrl}/api/extension/ingest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(capture),
      },
    )
    let response = await ingest(session)
    if (response.status === 401) {
      const refreshed = await BuyerWatchExtensionCommon.getValidSession({ config, forceRefresh: true })
      if (!refreshed) throw new Error('session_expired')
      response = await ingest(refreshed)
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'capture_failed')

    captureButton.textContent = payload.duplicate ? 'Already captured' : 'Captured'
    setStatus(
      payload.duplicate
        ? 'This conversation is already in BuyerWatch.'
        : payload.queued
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
