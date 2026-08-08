const BuyerWatchCapture = (() => {
  const clean = (value) => String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const textFrom = (root, selectors) => {
    for (const selector of selectors) {
      const element = root?.querySelector?.(selector)
      const value = clean(element?.innerText || element?.textContent)
      if (value) return value
    }
    return ''
  }

  const canonicalUrl = () => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href
    const url = new URL(canonical || window.location.href)
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  const eventIdFromUrl = (url) => {
    const pathname = new URL(url).pathname
    return pathname.match(/\/comments\/([^/]+)/i)?.[1] || pathname
  }

  const isoTimestamp = (value) => {
    const raw = clean(value)
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
    ].map((attribute) => post?.getAttribute?.(attribute)).find(Boolean)
    const timeElement = post?.querySelector?.('faceplate-timeago[ts], time[datetime]')
    return isoTimestamp(
      attributeValue
      || timeElement?.getAttribute?.('ts')
      || timeElement?.getAttribute?.('datetime'),
    )
  }

  const findArticleForPath = (path) => {
    const articles = [...document.querySelectorAll('main article, article')]
    return articles.find((article) => (
      [...article.querySelectorAll('a[href]')]
        .some((link) => link.getAttribute('href')?.includes(path))
    )) || articles[0] || document.querySelector('main')
  }

  const captureReddit = (url) => {
    const pathname = new URL(url).pathname
    const post = [...document.querySelectorAll('shreddit-post')]
      .find((element) => element.getAttribute('permalink')?.includes(pathname))
      || document.querySelector('shreddit-post')
      || findArticleForPath(pathname)

    const title = clean(
      post?.getAttribute?.('post-title')
      || document.querySelector('h1')?.textContent,
    )
    const text = textFrom(post, [
      '[slot="text-body"]',
      '[data-post-click-location="text-body"]',
      '[data-testid="post-content"]',
    ]) || clean(post?.innerText)
    const author = clean(
      post?.getAttribute?.('author')
      || textFrom(post, ['[data-testid="post_author_link"]', 'a[href*="/user/"]']),
    )
    const community = clean(
      post?.getAttribute?.('subreddit-prefixed-name')
      || pathname.match(/\/r\/([^/]+)/i)?.[1],
    ).replace(/^r\//i, '')

    return {
      title,
      text,
      author,
      community,
      publishedAt: publishedAtFrom(post),
    }
  }

  const capture = () => {
    const hostname = window.location.hostname.toLowerCase()
    if (!hostname.endsWith('reddit.com')) {
      return { error: 'unsupported_site' }
    }

    const url = canonicalUrl()
    const details = captureReddit(url)

    if (!details.text || details.text.length < 12) {
      return { error: 'conversation_not_found' }
    }

    return {
      platform: 'reddit',
      sourceEventId: eventIdFromUrl(url),
      url,
      title: details.title,
      text: details.text,
      author: details.author,
      community: details.community,
      publishedAt: details.publishedAt || undefined,
      capturedAt: new Date().toISOString(),
    }
  }

  return { capture }
})()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'BUYERWATCH_CAPTURE') return
  sendResponse(BuyerWatchCapture.capture())
})

const BuyerWatchReplyAssist = (() => {
  const DEFAULT_APP_URL = 'https://buyerwatch.co'

  const clean = (value) => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  const postId = (value) => {
    try {
      return new URL(value).pathname.match(/\/comments\/([^/]+)/i)?.[1] || ''
    } catch {
      return ''
    }
  }

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

  const clickComposerTrigger = () => {
    const candidates = [...document.querySelectorAll('button, [role="button"]')]
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
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(composer)
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.execCommand('insertText', false, text)
      composer.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text,
      }))
      return clean(composer.textContent) === clean(text)
    }
    return false
  }

  const getAppUrl = async () => {
    const { appUrl } = await chrome.storage.sync.get('appUrl')
    const raw = String(appUrl || DEFAULT_APP_URL).trim().replace(/\/+$/, '')
    if (/^https?:\/\//i.test(raw)) return raw
    return `https://${raw}`
  }

  const reportStatus = async (pending, action, permalink) => {
    const { buyerwatchSession } = await chrome.storage.local.get('buyerwatchSession')
    if (!buyerwatchSession?.access_token) return false
    const appUrl = await getAppUrl()
    const response = await fetch(`${appUrl}/api/extension/reply-status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${buyerwatchSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        threadId: pending.threadId,
        text: pending.text,
        permalink: permalink || undefined,
      }),
    })
    return response.ok
  }

  const findPostedPermalink = (text) => {
    const excerpt = clean(text).slice(0, 120)
    if (excerpt.length < 12) return null
    const comments = [
      ...document.querySelectorAll('shreddit-comment, [data-testid="comment"], article'),
    ]
    const comment = comments.find(element => clean(element.textContent).includes(excerpt))
    if (!comment) return null
    const raw = comment.getAttribute?.('permalink')
      || [...comment.querySelectorAll('a[href]')]
        .map(link => link.href)
        .find(href => /\/comments\/[^/]+\/[^/]+\/[^/]+/i.test(href))
    if (!raw) return null
    try {
      return new URL(raw, window.location.origin).toString()
    } catch {
      return null
    }
  }

  const watchForConfirmation = (pending) => {
    const deadline = Math.min(pending.expiresAt, Date.now() + 10 * 60_000)
    const timer = window.setInterval(async () => {
      if (Date.now() >= deadline) {
        window.clearInterval(timer)
        return
      }
      const permalink = findPostedPermalink(pending.text)
      if (!permalink) return
      window.clearInterval(timer)
      if (await reportStatus(pending, 'confirmed', permalink)) {
        await chrome.storage.local.remove('buyerwatchPendingReply')
      }
    }, 2_000)
  }

  const initialize = async () => {
    const { buyerwatchPendingReply: pending } = await chrome.storage.local.get('buyerwatchPendingReply')
    if (
      !pending
      || pending.expiresAt <= Date.now()
      || !postId(pending.postUrl)
      || postId(pending.postUrl) !== postId(window.location.href)
    ) {
      if (pending?.expiresAt <= Date.now()) {
        await chrome.storage.local.remove('buyerwatchPendingReply')
      }
      return
    }

    clickComposerTrigger()
    const deadline = Date.now() + 15_000
    let composer = findComposer()
    while (!composer && Date.now() < deadline) {
      await new Promise(resolve => window.setTimeout(resolve, 300))
      composer = findComposer()
    }
    if (!composer || !setComposerText(composer, pending.text)) return

    await chrome.storage.local.set({
      buyerwatchPendingReply: { ...pending, prefilledAt: Date.now() },
    })
    await reportStatus(pending, 'prefilled')
    watchForConfirmation(pending)
  }

  return { initialize }
})()

void BuyerWatchReplyAssist.initialize()
