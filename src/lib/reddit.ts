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

export async function fetchSubredditNew(subreddit: string, limit: number = 25): Promise<NormalizedPost[]> {
  const redditApisKey = (process.env.REDDITAPIS_API_KEY || '').trim()
  const isApproved = process.env.REDDIT_API_APPROVED === 'true'
  const forceLive = process.env.REDDITAPIS_FORCE_LIVE === 'true'
  const useProxy = redditApisKey && !redditApisKey.includes('TODO') && (process.env.NODE_ENV !== 'development' || forceLive)
  let response: Response | null = null

  try {
    if (useProxy) {
      console.log(`[reddit] Using redditapis.com proxy for r/${subreddit}`)
      const url = `https://api.redditapis.com/r/${subreddit}/new?limit=${limit}`
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${redditApisKey}`,
          'User-Agent': process.env.REDDIT_USER_AGENT || 'scouto/1.0',
        }
      })
    } else if (!isApproved) {
      console.log(`[reddit] API not approved yet — attempting public JSON feed fetch for r/${subreddit}`)
      const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`
      response = await fetch(url, {
        headers: {
          'User-Agent': process.env.REDDIT_USER_AGENT || 'ScoutoBot/1.0 (Mozilla/5.0; Windows NT 10.0; Win64; x64)',
        }
      })
    } else {
      const token = await getRedditToken()
      const url = `https://oauth.reddit.com/r/${subreddit}/new?limit=${limit}`
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': process.env.REDDIT_USER_AGENT || 'scouto/1.0',
        }
      })
    }

    if (!response.ok) {
      throw new Error(`Reddit request failed with status: ${response.status}`)
    }
  } catch (err) {
    console.warn(`[reddit] Live fetch failed, falling back to mock data:`, err)
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
  
  const json = await response.json() as any
  const posts = json.data?.children?.map((child: any) => child.data) || []
  
  return posts.map((post: any): NormalizedPost => ({
    platform: 'reddit',
    externalId: post.id,
    author: post.author,
    text: `${post.title || ''}\n\n${post.selftext || ''}`.trim(),
    url: `https://reddit.com${post.permalink}`,
    createdAt: new Date(post.created_utc * 1000).toISOString(),
    sourceTarget: subreddit
  }))
}
