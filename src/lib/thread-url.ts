type ThreadLink = {
  platform: string
  url: string | null
}

export function getSafeThreadUrl(thread: ThreadLink): string | null {
  if (!thread.url) return null

  try {
    const url = new URL(thread.url)
    if (url.protocol !== 'https:') return null

    const hostname = url.hostname.toLocaleLowerCase()
    const isRedditUrl = hostname === 'redd.it'
      || hostname === 'reddit.com'
      || hostname.endsWith('.reddit.com')
    const isBlueskyUrl = hostname === 'bsky.app'

    if (thread.platform === 'reddit' && !isRedditUrl) return null
    if (thread.platform === 'bluesky' && !isBlueskyUrl) return null
    if (!['reddit', 'bluesky'].includes(thread.platform)) return null

    return url.toString()
  } catch {
    return null
  }
}
