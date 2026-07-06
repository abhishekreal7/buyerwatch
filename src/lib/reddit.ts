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
  if (process.env.REDDIT_API_APPROVED !== 'true') {
    console.warn(`[reddit] API not yet approved — returning mock data for r/${subreddit}`)
    return [
      {
        platform: 'reddit',
        externalId: `mock-${Date.now()}`,
        author: 'mock_user',
        text: 'This is a mock post about needing an email marketing tool.',
        url: 'https://reddit.com/r/mock/mock_post',
        createdAt: new Date().toISOString(),
        sourceTarget: subreddit
      }
    ]
  }

  // The flag USE_MOCK_REDDIT can still be respected strictly if REDDIT_API_APPROVED is true,
  // but if we are here, we are approved. Just check USE_MOCK_REDDIT just in case.
  if (process.env.USE_MOCK_REDDIT === 'true') {
    return [
      {
        platform: 'reddit',
        externalId: `mock-${Date.now()}`,
        author: 'mock_user',
        text: 'This is a mock post about needing an email marketing tool.',
        url: 'https://reddit.com/r/mock/mock_post',
        createdAt: new Date().toISOString(),
        sourceTarget: subreddit
      }
    ]
  }

  const token = await getRedditToken()
  
  // Use oauth.reddit.com for authenticated requests
  const url = `https://oauth.reddit.com/r/${subreddit}/new?limit=${limit}`
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': process.env.REDDIT_USER_AGENT || 'scouto/1.0',
    }
  })
  
  if (!response.ok) {
    if (response.status === 429) {
      console.warn('Reddit API rate limited (429)')
      // BullMQ will retry with exponential backoff if thrown
      throw new Error('Reddit API Rate Limited')
    }
    throw new Error(`Reddit fetch failed: ${response.statusText}`)
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
