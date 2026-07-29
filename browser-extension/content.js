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

  const eventIdFromUrl = (platform, url) => {
    const pathname = new URL(url).pathname
    const patterns = {
      reddit: /\/comments\/([^/]+)/i,
      bluesky: /\/post\/([^/]+)/i,
      x: /\/status\/(\d+)/i,
    }
    return pathname.match(patterns[platform])?.[1] || pathname
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

    return { title, text, author, community }
  }

  const captureBluesky = (url) => {
    const pathname = new URL(url).pathname
    const article = findArticleForPath(pathname)
    const text = textFrom(article, [
      '[data-testid="postText"]',
      '[data-testid="contentHider-post"]',
    ]) || clean(article?.innerText)
    const profilePath = [...(article?.querySelectorAll?.('a[href*="/profile/"]') || [])]
      .map((link) => link.getAttribute('href'))
      .find(Boolean)
    const author = clean(profilePath?.match(/\/profile\/([^/]+)/)?.[1])

    return {
      title: text.split('\n')[0]?.slice(0, 180) || 'Bluesky conversation',
      text,
      author,
      community: author,
    }
  }

  const captureX = (url) => {
    const pathname = new URL(url).pathname
    const article = findArticleForPath(pathname)
    const text = textFrom(article, ['[data-testid="tweetText"]']) || clean(article?.innerText)
    const authorBlock = textFrom(article, ['[data-testid="User-Name"]'])
    const handle = authorBlock.match(/@\w+/)?.[0] || ''

    return {
      title: text.split('\n')[0]?.slice(0, 180) || 'X conversation',
      text,
      author: handle,
      community: handle,
    }
  }

  const capture = () => {
    const hostname = window.location.hostname.toLowerCase()
    const platform = hostname.endsWith('reddit.com')
      ? 'reddit'
      : hostname === 'bsky.app'
        ? 'bluesky'
        : hostname === 'x.com' || hostname === 'twitter.com'
          ? 'x'
          : null

    if (!platform) {
      return { error: 'unsupported_site' }
    }

    const url = canonicalUrl()
    const details = platform === 'reddit'
      ? captureReddit(url)
      : platform === 'bluesky'
        ? captureBluesky(url)
        : captureX(url)

    if (!details.text || details.text.length < 12) {
      return { error: 'conversation_not_found' }
    }

    return {
      platform,
      sourceEventId: eventIdFromUrl(platform, url),
      url,
      title: details.title,
      text: details.text,
      author: details.author,
      community: details.community,
      capturedAt: new Date().toISOString(),
    }
  }

  return { capture }
})()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'BUYERWATCH_CAPTURE') return
  sendResponse(BuyerWatchCapture.capture())
})
