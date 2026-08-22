const ALLOWED_APP_ORIGINS = new Set([
  'https://buyerwatch.co',
  'https://www.buyerwatch.co',
  'http://localhost:3000',
])

function senderOrigin(sender) {
  try {
    return new URL(sender?.url || sender?.origin).origin
  } catch {
    return ''
  }
}

function validUsername(value) {
  const username = typeof value === 'string' ? value.trim().replace(/^u\//i, '') : ''
  return /^[A-Za-z0-9_-]{3,32}$/.test(username) ? username : null
}

async function identityFromTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'BUYERWATCH_REDDIT_IDENTITY',
    })
    const username = validUsername(response?.username)
    return response?.loggedIn === true && username ? username : null
  } catch {
    return null
  }
}

async function waitForTab(tabId, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (tab) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve(tab)
    }
    const onUpdated = (updatedId, changeInfo, tab) => {
      if (updatedId === tabId && changeInfo.status === 'complete') finish(tab)
    }
    const timer = setTimeout(async () => {
      finish(await chrome.tabs.get(tabId).catch(() => null))
    }, timeoutMs)
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

async function detectRedditIdentity() {
  const existing = await chrome.tabs.query({ url: ['https://reddit.com/user/*', 'https://*.reddit.com/user/*'] })
  const ordered = existing.sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))
  for (const tab of ordered) {
    if (!tab.id) continue
    const username = await identityFromTab(tab.id)
    if (username) return { success: true, username }
  }

  // Reddit resolves /user/me to the profile belonging to the active browser
  // session. Opening it is user-initiated by the Connect with Chrome button.
  const opened = await chrome.tabs.create({ url: 'https://www.reddit.com/user/me/', active: true })
  if (!opened.id) return { success: false, error: 'reddit_tab_unavailable' }
  const loaded = await waitForTab(opened.id)
  const username = loaded ? await identityFromTab(opened.id) : null
  return username
    ? { success: true, username }
    : { success: false, error: 'reddit_login_required' }
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!ALLOWED_APP_ORIGINS.has(senderOrigin(sender))) {
    sendResponse({ success: false, error: 'sender_not_allowed' })
    return false
  }
  if (message?.type === 'BUYERWATCH_CONNECTOR_PING') {
    sendResponse({ success: true, version: chrome.runtime.getManifest().version })
    return false
  }
  if (message?.type !== 'BUYERWATCH_CONNECT_REDDIT') {
    sendResponse({ success: false, error: 'unsupported_message' })
    return false
  }
  void detectRedditIdentity()
    .then(sendResponse)
    .catch(() => sendResponse({ success: false, error: 'reddit_identity_failed' }))
  return true
})
