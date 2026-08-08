importScripts('common.js')

const BuyerWatchExtensionBackground = (() => {
  const productionOrigins = new Set([
    'https://buyerwatch.co',
    'https://www.buyerwatch.co',
  ])

  const isDevelopmentBuild = () => chrome.runtime.getManifest().name.includes('Development')

  const senderOrigin = (sender) => {
    try {
      return new URL(sender?.url || sender?.origin).origin
    } catch {
      return ''
    }
  }

  const isAllowedSender = (sender) => {
    const origin = senderOrigin(sender)
    if (productionOrigins.has(origin)) return true
    return isDevelopmentBuild()
      && (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000')
  }

  const readSession = (value) => {
    const expiresAt = Number(value?.expires_at)
    if (
      typeof value?.access_token !== 'string'
      || value.access_token.length < 20
      || value.access_token.length > 20_000
      || typeof value?.refresh_token !== 'string'
      || value.refresh_token.length < 20
      || value.refresh_token.length > 20_000
      || !Number.isFinite(expiresAt)
      || expiresAt < Math.floor(Date.now() / 1000) - 300
      || expiresAt > Math.floor(Date.now() / 1000) + 31 * 24 * 60 * 60
      || !BuyerWatchExtensionCommon.isUuid(value?.user?.id)
    ) {
      return null
    }

    return {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      expires_at: expiresAt,
      expires_in: Number.isFinite(Number(value.expires_in)) ? Number(value.expires_in) : undefined,
      token_type: value.token_type === 'bearer' ? 'bearer' : undefined,
      user: {
        id: value.user.id,
        email: typeof value.user.email === 'string'
          ? value.user.email.slice(0, 320)
          : undefined,
      },
    }
  }

  const readPendingReply = (value) => {
    const post = BuyerWatchExtensionCommon.parseRedditPostUrl(value?.postUrl)
    if (
      !BuyerWatchExtensionCommon.isUuid(value?.threadId)
      || typeof value?.text !== 'string'
      || !value.text.trim()
      || value.text.length > 10_000
      || !post
    ) {
      return null
    }
    return {
      threadId: value.threadId,
      text: value.text,
      postUrl: post.url,
      expiresAt: Date.now() + 15 * 60_000,
    }
  }

  const handleExternalMessage = async (message, sender) => {
    if (!isAllowedSender(sender)) return { success: false, error: 'sender_not_allowed' }

    if (message?.type === 'BUYERWATCH_EXTENSION_PING') {
      return { success: true, version: chrome.runtime.getManifest().version }
    }

    if (message?.type === 'BUYERWATCH_EXTENSION_SESSION') {
      const session = readSession(message.session)
      if (!session) return { success: false, error: 'invalid_session' }
      await chrome.storage.local.set({ buyerwatchSession: session })
      return { success: true }
    }

    if (message?.type === 'BUYERWATCH_PREPARE_REPLY') {
      const pending = readPendingReply(message.reply)
      if (!pending) return { success: false, error: 'invalid_reply' }
      await chrome.storage.local.set({ buyerwatchPendingReply: pending })
      return { success: true, threadId: pending.threadId }
    }

    return { success: false, error: 'unsupported_message' }
  }

  return {
    handleExternalMessage,
    isAllowedSender,
    readPendingReply,
    readSession,
  }
})()

globalThis.BuyerWatchExtensionBackground = BuyerWatchExtensionBackground

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  void BuyerWatchExtensionBackground.handleExternalMessage(message, sender)
    .then(sendResponse)
    .catch(() => sendResponse({ success: false, error: 'message_failed' }))
  return true
})
