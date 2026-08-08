const BuyerWatchCapture = (() => {
  const cleanText = (value) => String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const textFrom = (root, selectors) => {
    for (const selector of selectors) {
      const element = root?.querySelector?.(selector)
      const value = cleanText(element?.innerText || element?.textContent)
      if (value) return value
    }
    return ''
  }

  const canonicalPost = () => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href
    return BuyerWatchExtensionCommon.parseRedditPostUrl(canonical || window.location.href)
  }

  const isoTimestamp = (value) => {
    const raw = BuyerWatchExtensionCommon.clean(value)
    if (!raw) return ''
    const numeric = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN
    const milliseconds = Number.isFinite(numeric)
      ? numeric * (numeric < 10_000_000_000 ? 1_000 : 1)
      : Date.parse(raw)
    if (!Number.isFinite(milliseconds)) return ''
    const now = Date.now()
    if (milliseconds > now + 5 * 60_000 || milliseconds < now - 30 * 365 * 24 * 60 * 60_000) {
      return ''
    }
    return new Date(milliseconds).toISOString()
  }

  const publishedAtFrom = (post) => {
    const attributeValue = [
      'created-timestamp',
      'created-at',
      'data-created-at',
      'data-timestamp',
    ].map(attribute => post?.getAttribute?.(attribute)).find(Boolean)
    const timeElement = post?.querySelector?.('faceplate-timeago[ts], time[datetime]')
    return isoTimestamp(
      attributeValue
      || timeElement?.getAttribute?.('ts')
      || timeElement?.getAttribute?.('datetime'),
    )
  }

  const postIdFromElement = (element) => {
    const directIds = [
      element?.getAttribute?.('post-id'),
      element?.getAttribute?.('data-fullname'),
    ]
    if (/^t3_[a-z0-9]+$/i.test(String(element?.id || ''))) {
      directIds.push(element.id)
    }
    for (const value of directIds) {
      const directId = String(value || '').replace(/^t3_/i, '').toLowerCase()
      if (directId && /^[a-z0-9]+$/i.test(directId)) return directId
    }

    const urls = [
      element?.getAttribute?.('permalink'),
      element?.getAttribute?.('data-permalink'),
      ...[...(element?.querySelectorAll?.('a[href*="/comments/"]') || [])]
        .map(link => link.href || link.getAttribute('href')),
    ]
    for (const value of urls) {
      try {
        const parsed = BuyerWatchExtensionCommon.parseRedditPostUrl(
          new URL(value, window.location.origin).toString(),
        )
        if (parsed) return parsed.postId
      } catch {
        // Keep looking for an exact post identity.
      }
    }
    return ''
  }

  const findPost = (postId) => {
    const candidates = [
      ...document.querySelectorAll('shreddit-post'),
      ...document.querySelectorAll('[data-testid="post-container"]'),
      ...document.querySelectorAll('.thing.link[data-fullname^="t3_"]'),
      ...document.querySelectorAll('main article'),
    ]
    return [...new Set(candidates)].find(element => postIdFromElement(element) === postId) || null
  }

  const captureReddit = (postIdentity) => {
    const post = findPost(postIdentity.postId)
    if (!post) return null

    const title = cleanText(
      post.getAttribute?.('post-title')
      || textFrom(post, [
        '[slot="title"]',
        '[data-testid="post-title"]',
        'h1',
        'a.title',
      ]),
    )
    const body = textFrom(post, [
      '[slot="text-body"]',
      '[data-post-click-location="text-body"]',
      '[data-testid="post-content"]',
      '[data-click-id="text"]',
      '.usertext-body',
    ])
    const text = body || title
    const author = cleanText(
      post.getAttribute?.('author')
      || textFrom(post, [
        '[data-testid="post_author_link"]',
        'a[href*="/user/"]',
        'a.author',
      ]),
    )
    const community = cleanText(
      post.getAttribute?.('subreddit-prefixed-name')
      || new URL(postIdentity.url).pathname.match(/\/r\/([^/]+)/i)?.[1],
    ).replace(/^r\//i, '')

    if (!text || text.length < 12) return null
    return {
      title,
      text,
      author,
      community,
      publishedAt: publishedAtFrom(post),
    }
  }

  const capture = () => {
    const postIdentity = canonicalPost()
    if (!postIdentity) return { error: 'unsupported_site' }
    const details = captureReddit(postIdentity)
    if (!details) return { error: 'conversation_not_found' }

    return {
      platform: 'reddit',
      sourceEventId: postIdentity.postId,
      url: postIdentity.url,
      title: details.title,
      text: details.text,
      author: details.author,
      community: details.community,
      publishedAt: details.publishedAt || undefined,
      capturedAt: new Date().toISOString(),
    }
  }

  return { capture, captureReddit, findPost }
})()

globalThis.BuyerWatchCapture = BuyerWatchCapture

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'BUYERWATCH_CAPTURE') return
  sendResponse(BuyerWatchCapture.capture())
})

const BuyerWatchReplyAssist = (() => {
  const clean = BuyerWatchExtensionCommon.clean

  const queryDeep = (selector, root = document) => {
    const direct = root.querySelector?.(selector)
    if (direct) return direct
    for (const element of root.querySelectorAll?.('*') || []) {
      if (!element.shadowRoot) continue
      const nested = queryDeep(selector, element.shadowRoot)
      if (nested) return nested
    }
    return null
  }

  const queryDeepAll = (selector, root = document, matches = []) => {
    matches.push(...(root.querySelectorAll?.(selector) || []))
    for (const element of root.querySelectorAll?.('*') || []) {
      if (element.shadowRoot) queryDeepAll(selector, element.shadowRoot, matches)
    }
    return matches
  }

  const clickComposerTrigger = () => {
    const candidates = queryDeepAll('button, [role="button"]')
    const trigger = candidates.find((element) => {
      const label = clean(element.getAttribute('aria-label') || element.textContent).toLowerCase()
      return label === 'add a comment' || label === 'join the conversation'
    })
    trigger?.click()
  }

  const findComposer = () => {
    const selectors = [
      'shreddit-composer [contenteditable="true"]',
      '[data-testid="comment-submission-form"] [contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      'textarea[name="text"]',
      'textarea[placeholder*="comment" i]',
      'textarea[aria-label*="comment" i]',
    ]
    for (const selector of selectors) {
      const composer = queryDeep(selector)
      if (composer) return composer
    }
    return null
  }

  const setComposerText = (composer, text) => {
    composer.focus()
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      setter?.call(composer, text)
      composer.dispatchEvent(new Event('input', { bubbles: true }))
      composer.dispatchEvent(new Event('change', { bubbles: true }))
      return clean(composer.value) === clean(text)
    }

    if (composer.getAttribute('contenteditable') === 'true') {
      composer.textContent = ''
      composer.focus()
      const inserted = typeof document.execCommand === 'function'
        && document.execCommand('insertText', false, text)
      if (!inserted) composer.textContent = text
      composer.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text,
      }))
      return clean(composer.textContent) === clean(text)
    }
    return false
  }

  const trackComposerText = (composer, pending) => {
    const update = () => {
      const currentText = clean(
        'value' in composer ? composer.value : composer.textContent,
      )
      // Reddit clears the composer after submission. Preserve the last
      // non-empty value so confirmation can still match the posted comment.
      if (!currentText || currentText.length > 10_000) return
      pending.text = currentText
      void chrome.storage.local.set({ buyerwatchPendingReply: pending })
    }
    composer.addEventListener?.('input', update)
    return update
  }

  const reportStatus = async (pending, action, permalink) => {
    const send = async (forceRefresh = false) => {
      let session
      try {
        session = await BuyerWatchExtensionCommon.getValidSession({ forceRefresh })
      } catch {
        return null
      }
      if (!session?.access_token) return null
      const appUrl = await BuyerWatchExtensionCommon.getAppUrl()
      try {
        return await BuyerWatchExtensionCommon.fetchWithTimeout(
          `${appUrl}/api/extension/reply-status`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action,
              threadId: pending.threadId,
              text: pending.text,
              permalink: permalink || undefined,
            }),
          },
        )
      } catch {
        return null
      }
    }

    let response = await send(false)
    if (response?.status === 401) response = await send(true)
    return response?.ok === true
  }

  const findPostedPermalinks = (text, postUrl) => {
    const post = BuyerWatchExtensionCommon.parseRedditPostUrl(postUrl)
    const excerpt = clean(text).slice(0, 120)
    if (!post || excerpt.length < 12) return []
    const comments = [
      ...document.querySelectorAll('shreddit-comment'),
      ...document.querySelectorAll('[data-testid="comment"]'),
      ...document.querySelectorAll('.thing.comment[data-fullname^="t1_"]'),
    ]
    const permalinks = []
    for (const comment of comments) {
      if (!clean(comment.textContent).includes(excerpt)) continue
      const candidates = [
        comment.getAttribute?.('permalink'),
        comment.getAttribute?.('data-permalink'),
        ...[...comment.querySelectorAll('a[href]')].map(link => link.href),
      ]
      for (const raw of candidates) {
        try {
          const url = new URL(raw, window.location.origin)
          const parsed = BuyerWatchExtensionCommon.parseRedditPostUrl(url.toString())
          if (
            parsed?.postId === post.postId
            && /\/comments\/[^/]+\/[^/]+\/[^/]+\/?$/i.test(url.pathname)
          ) {
            url.search = ''
            url.hash = ''
            permalinks.push(url.toString())
            break
          }
        } catch {
          // Ignore malformed links injected into Reddit content.
        }
      }
    }
    return [...new Set(permalinks)]
  }

  const watchForConfirmation = (pending, baselinePermalinks = []) => {
    const baseline = new Set(baselinePermalinks)
    const deadline = Math.min(pending.expiresAt, Date.now() + 10 * 60_000)
    let inFlight = false
    let timer
    let reportFailures = 0
    let nextReportAt = 0

    const check = async () => {
      if (inFlight || Date.now() >= deadline) {
        if (Date.now() >= deadline && timer) window.clearInterval(timer)
        return
      }
      const permalink = findPostedPermalinks(pending.text, pending.postUrl)
        .find(candidate => !baseline.has(candidate))
      if (!permalink || Date.now() < nextReportAt) return
      inFlight = true
      try {
        if (await reportStatus(pending, 'confirmed', permalink)) {
          if (timer) window.clearInterval(timer)
          await chrome.storage.local.remove('buyerwatchPendingReply')
        } else {
          reportFailures += 1
          nextReportAt = Date.now() + Math.min(30_000, 2_000 * (2 ** (reportFailures - 1)))
        }
      } finally {
        inFlight = false
      }
    }

    timer = window.setInterval(() => void check(), 2_000)
    void check()
    return timer
  }

  const initialize = async () => {
    const { buyerwatchPendingReply: pending } = await chrome.storage.local.get('buyerwatchPendingReply')
    const pendingPost = BuyerWatchExtensionCommon.parseRedditPostUrl(pending?.postUrl)
    const currentPost = BuyerWatchExtensionCommon.parseRedditPostUrl(window.location.href)
    if (
      !pending
      || pending.expiresAt <= Date.now()
      || !pendingPost
      || !currentPost
      || pendingPost.postId !== currentPost.postId
    ) {
      if (pending?.expiresAt <= Date.now()) {
        await chrome.storage.local.remove('buyerwatchPendingReply')
      }
      return
    }

    const existingPermalinks = findPostedPermalinks(pending.text, pending.postUrl)
    if (pending.prefilledAt && existingPermalinks.length > 0) {
      for (const permalink of existingPermalinks) {
        if (await reportStatus(pending, 'confirmed', permalink)) {
          await chrome.storage.local.remove('buyerwatchPendingReply')
          return
        }
      }
    }

    clickComposerTrigger()
    const deadline = Date.now() + 15_000
    let composer = findComposer()
    while (!composer && Date.now() < deadline) {
      await new Promise(resolve => window.setTimeout(resolve, 300))
      composer = findComposer()
    }
    if (!composer || !setComposerText(composer, pending.text)) return

    const updatedPending = { ...pending, prefilledAt: Date.now() }
    await chrome.storage.local.set({ buyerwatchPendingReply: updatedPending })
    trackComposerText(composer, updatedPending)
    await reportStatus(updatedPending, 'prefilled')
    watchForConfirmation(updatedPending, existingPermalinks)
  }

  return {
    findPostedPermalinks,
    initialize,
    reportStatus,
    setComposerText,
    trackComposerText,
    watchForConfirmation,
  }
})()

globalThis.BuyerWatchReplyAssist = BuyerWatchReplyAssist

void BuyerWatchReplyAssist.initialize().catch(() => undefined)
