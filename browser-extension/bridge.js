function announceBuyerWatchExtension() {
  document.documentElement.setAttribute('data-buyerwatch-extension', 'installed')
  window.dispatchEvent(new CustomEvent('buyerwatch:extension-ready'))
}

function readBuyerWatchSession(event) {
  if (typeof event?.detail !== 'string') return null

  try {
    const session = JSON.parse(event.detail)
    if (
      typeof session?.access_token !== 'string'
      || typeof session?.refresh_token !== 'string'
      || typeof session?.expires_at !== 'number'
      || !BuyerWatchExtensionCommon.isUuid(session?.user?.id)
    ) {
      return null
    }
    return session
  } catch {
    return null
  }
}

async function connectBuyerWatchSession(event) {
  const session = readBuyerWatchSession(event)
  if (!session) return

  await chrome.storage.local.set({ buyerwatchSession: session })
  window.dispatchEvent(new CustomEvent('buyerwatch:extension-session-ready'))
}

function readPendingReply(event) {
  if (typeof event?.detail !== 'string') return null
  try {
    const pending = JSON.parse(event.detail)
    const post = BuyerWatchExtensionCommon.parseRedditPostUrl(pending?.postUrl)
    if (
      !BuyerWatchExtensionCommon.isUuid(pending?.threadId)
      || typeof pending?.text !== 'string'
      || pending.text.length < 1
      || pending.text.length > 10_000
      || !post
    ) {
      return null
    }
    return {
      threadId: pending.threadId,
      text: pending.text,
      postUrl: post.url,
      expiresAt: Date.now() + 15 * 60_000,
    }
  } catch {
    return null
  }
}

async function prepareRedditReply(event) {
  const pending = readPendingReply(event)
  if (!pending) return
  await chrome.storage.local.set({ buyerwatchPendingReply: pending })
  window.dispatchEvent(new CustomEvent('buyerwatch:prefill-ready', {
    detail: pending.threadId,
  }))
}

announceBuyerWatchExtension()
window.addEventListener('buyerwatch:extension-detect', announceBuyerWatchExtension)
window.addEventListener('buyerwatch:extension-session', connectBuyerWatchSession)
window.addEventListener('buyerwatch:prefill-reddit', prepareRedditReply)
