import { NormalizedPost } from './types'

let cachedToken: string | null = null
let tokenExpiry: number = 0

async function getRedditToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }

  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Reddit OAuth credentials missing')
  }

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT || 'scouto/1.0',
    },
    body: 'grant_type=client_credentials'
  })

  if (!response.ok) {
    throw new Error(`Reddit auth failed: ${response.statusText}`)
  }

  const data = await response.json() as any
  cachedToken = data.access_token
  // Expire 1 minute before actual expiry to be safe
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000

  return cachedToken!
}

/**
 * Parse Reddit's public Atom RSS feed for a subreddit.
 * No external dependencies — regex extraction on the XML string.
 * Provides: id, author, title, body text, url, published timestamp.
 * These are exactly the fields NormalizedPost uses; upvote/comment counts
 * are not part of the data model and are not used by the scoring pipeline.
 */
function parseRedditRss(xml: string, subreddit: string): NormalizedPost[] {
  const posts: NormalizedPost[] = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let match: RegExpExecArray | null

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1]

    // <id>t3_POSTID</id> — strip the "t3_" fullname prefix to stay consistent
    // with the post.id format returned by the JSON API (used in dedup checks)
    const idMatch = entry.match(/<id>[^<]*?([a-z0-9]+)<\/id>/)
    const externalId = idMatch?.[1]?.trim() ?? ''

    // <author><name>/u/username</name></author>
    const authorMatch = entry.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/)
    const author = (authorMatch?.[1]?.trim() ?? '').replace(/^\/u\//, '')

    // <title>Post title</title>
    const titleMatch = entry.match(/<title>([^<]*)<\/title>/)
    const title = decodeXmlEntities(titleMatch?.[1]?.trim() ?? '')

    // <link href="https://www.reddit.com/r/.../comments/.../" />
    const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/)
    const url = linkMatch?.[1]?.trim() ?? ''

    // <published>2026-07-22T21:58:40+00:00</published>
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/)
    const createdAt = publishedMatch?.[1]?.trim()
      ? new Date(publishedMatch[1].trim()).toISOString()
      : new Date().toISOString()

    // <content type="html">HTML-encoded body containing Reddit markdown div</content>
    const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)
    let bodyText = ''
    if (contentMatch?.[1]) {
      bodyText = decodeXmlEntities(contentMatch[1])
        .replace(/<[^>]+>/g, ' ')  // strip all HTML tags
        .replace(/\s+/g, ' ')      // collapse whitespace
        .trim()
    }

    const text = bodyText ? `${title}\n\n${bodyText}` : title

    // Skip entries without a usable post ID or URL (e.g. pinned AutoModerator stickies)
    if (!externalId || !url) continue

    posts.push({
      platform: 'reddit',
      externalId,
      author,
      title,
      text,
      url,
      createdAt,
      sourceTarget: subreddit,
    })
  }

  return posts
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#32;/g, ' ')
    .replace(/&apos;/g, "'")
}

export async function fetchSubredditNew(subreddit: string, limit: number = 25): Promise<NormalizedPost[]> {
  const redditApisKey = (process.env.REDDITAPIS_API_KEY || '').trim()
  const isApproved = process.env.REDDIT_API_APPROVED === 'true'
  const forceLive = process.env.REDDITAPIS_FORCE_LIVE === 'true'

  // ── Redis cache key ────────────────────────────────────────────────
  // Prevents hammering the same subreddit RSS endpoint within a 5-min window.
  // The cache stores the serialised NormalizedPost[] array.
  let redisClient: import('ioredis').default | null = null
  const cacheKey = `rss:r:${subreddit}`
  const CACHE_TTL = 300 // 5 minutes

  try {
    const { redis } = await import('./redis')
    redisClient = redis
    const cached = await redis.get(cacheKey)
    if (cached) {
      const posts: NormalizedPost[] = JSON.parse(cached)
      console.log(`[reddit] Cache HIT for r/${subreddit} (${posts.length} posts)`)
      return posts
    }
  } catch (cacheErr) {
    console.warn(`[reddit] Redis cache unavailable, continuing without cache:`, cacheErr)
  }

  // ── PRIMARY: Reddit public RSS feed (free, no auth, no per-call cost) ──────
  try {
    const rssUrl = `https://www.reddit.com/r/${subreddit}/new/.rss?limit=${limit}`
    console.log(`[reddit] RSS fetch for r/${subreddit}`)
    const rssResponse = await fetch(rssUrl, {
      headers: {
        'User-Agent': process.env.REDDIT_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    })

    if (rssResponse.ok) {
      const xml = await rssResponse.text()
      const posts = parseRedditRss(xml, subreddit)
      if (posts.length > 0) {
        console.log(`[reddit] RSS: ${posts.length} posts from r/${subreddit}`)
        // Cache the result
        if (redisClient) {
          await redisClient.set(cacheKey, JSON.stringify(posts), 'EX', CACHE_TTL).catch(() => {})
        }
        return posts
      }
      console.warn(`[reddit] RSS returned 0 parseable posts for r/${subreddit}, falling back`)
    } else if (rssResponse.status === 429) {
      console.warn(`[reddit] RSS 429 for r/${subreddit} — rate limited. Waiting 2s and retrying with search RSS...`)
      // Wait 2 seconds then try search-based RSS as alternative
      await new Promise(r => setTimeout(r, 2000))
      try {
        const searchUrl = `https://www.reddit.com/r/${subreddit}/new/.rss?limit=${limit}&after=`
        const retryResponse = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml;q=0.9',
          }
        })
        if (retryResponse.ok) {
          const xml = await retryResponse.text()
          const posts = parseRedditRss(xml, subreddit)
          if (posts.length > 0) {
            console.log(`[reddit] RSS retry: ${posts.length} posts from r/${subreddit}`)
            if (redisClient) {
              await redisClient.set(cacheKey, JSON.stringify(posts), 'EX', CACHE_TTL).catch(() => {})
            }
            return posts
          }
        }
      } catch (retryErr) {
        console.warn(`[reddit] RSS retry also failed for r/${subreddit}:`, retryErr)
      }
    } else {
      console.warn(`[reddit] RSS ${rssResponse.status} for r/${subreddit}, falling back`)
    }
  } catch (rssErr) {
    console.warn(`[reddit] RSS failed for r/${subreddit}:`, rssErr)
  }

  // ── FALLBACK 1: redditapis.com proxy ($0.002/call) ─────────────────────────
  if (redditApisKey && !redditApisKey.includes('TODO') && (process.env.NODE_ENV !== 'development' || forceLive)) {
    try {
      console.log(`[reddit] Falling back to redditapis.com proxy for r/${subreddit}`)
      const url = `https://api.redditapis.com/r/${subreddit}/new?limit=${limit}`
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${redditApisKey}`,
          'User-Agent': process.env.REDDIT_USER_AGENT || 'scouto/1.0',
        }
      })
      if (response.ok) {
        const json = await response.json() as any
        const posts = json.data?.children?.map((child: any) => child.data) || []
        const normalized = posts.map((post: any): NormalizedPost => ({
          platform: 'reddit',
          externalId: post.id,
          author: post.author,
          text: `${post.title || ''}\n\n${post.selftext || ''}`.trim(),
          url: `https://reddit.com${post.permalink}`,
          createdAt: new Date(post.created_utc * 1000).toISOString(),
          sourceTarget: subreddit
        }))
        if (redisClient && normalized.length > 0) {
          await redisClient.set(cacheKey, JSON.stringify(normalized), 'EX', CACHE_TTL).catch(() => {})
        }
        return normalized
      }
    } catch (proxyErr) {
      console.warn(`[reddit] redditapis.com fallback failed for r/${subreddit}:`, proxyErr)
    }
  }

  // ── FALLBACK 2: Official Reddit OAuth API ──────────────────────────────────
  if (isApproved) {
    try {
      console.log(`[reddit] Falling back to OAuth API for r/${subreddit}`)
      const token = await getRedditToken()
      const url = `https://oauth.reddit.com/r/${subreddit}/new?limit=${limit}`
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': process.env.REDDIT_USER_AGENT || 'scouto/1.0',
        }
      })
      if (response.ok) {
        const json = await response.json() as any
        const posts = json.data?.children?.map((child: any) => child.data) || []
        const normalized = posts.map((post: any): NormalizedPost => ({
          platform: 'reddit',
          externalId: post.id,
          author: post.author,
          text: `${post.title || ''}\n\n${post.selftext || ''}`.trim(),
          url: `https://reddit.com${post.permalink}`,
          createdAt: new Date(post.created_utc * 1000).toISOString(),
          sourceTarget: subreddit
        }))
        if (redisClient && normalized.length > 0) {
          await redisClient.set(cacheKey, JSON.stringify(normalized), 'EX', CACHE_TTL).catch(() => {})
        }
        return normalized
      }
    } catch (oauthErr) {
      console.warn(`[reddit] OAuth fallback failed for r/${subreddit}:`, oauthErr)
    }
  }

  // ── FALLBACK 3: Public .json endpoint (dev only) ───────────────────────────
  if (!isApproved && !redditApisKey) {
    try {
      console.log(`[reddit] Attempting public JSON feed for r/${subreddit}`)
      const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`
      const response = await fetch(url, {
        headers: {
          'User-Agent': process.env.REDDIT_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        }
      })
      if (response.ok) {
        const json = await response.json() as any
        const posts = json.data?.children?.map((child: any) => child.data) || []
        const normalized = posts.map((post: any): NormalizedPost => ({
          platform: 'reddit',
          externalId: post.id,
          author: post.author,
          text: `${post.title || ''}\n\n${post.selftext || ''}`.trim(),
          url: `https://reddit.com${post.permalink}`,
          createdAt: new Date(post.created_utc * 1000).toISOString(),
          sourceTarget: subreddit
        }))
        if (redisClient && normalized.length > 0) {
          await redisClient.set(cacheKey, JSON.stringify(normalized), 'EX', CACHE_TTL).catch(() => {})
        }
        return normalized
      }
    } catch (jsonErr) {
      console.warn(`[reddit] Public JSON fallback failed for r/${subreddit}:`, jsonErr)
    }
  }

  // ── FINAL FALLBACK: mock data ──────────────────────────────────────────────
  console.warn(`[reddit] All fetch paths exhausted for r/${subreddit}, returning mock`)
  return [
    {
      platform: 'reddit',
      externalId: `mock-${Date.now()}`,
      author: 'mock_user',
      text: 'This is a mock post about needing an email marketing tool (Fallback).',
      url: 'https://reddit.com/r/mock/mock_post',
      createdAt: new Date().toISOString(),
      sourceTarget: subreddit
    }
  ]
}

