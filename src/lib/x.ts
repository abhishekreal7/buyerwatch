import { TwitterApi, type TwitterApiTokens } from 'twitter-api-v2'
import { NormalizedPost } from './types'
import { isDevelopmentMockEnabled } from './env'

const hasCredentials = Boolean(
  process.env.X_API_KEY
  && process.env.X_API_SECRET
  && process.env.X_ACCESS_TOKEN
  && process.env.X_ACCESS_SECRET,
)

const credentials: TwitterApiTokens | null = hasCredentials ? {
  appKey: process.env.X_API_KEY!,
  appSecret: process.env.X_API_SECRET!,
  accessToken: process.env.X_ACCESS_TOKEN!,
  accessSecret: process.env.X_ACCESS_SECRET!,
} : null

// Instantiate only with a complete credential set. Partial credentials used to
// create a client that failed later during a paid monitoring run.
const client = credentials ? new TwitterApi(credentials) : null

/** True only when X can really be offered to a paying customer. */
export function isXDiscoveryConfigured(): boolean {
  return process.env.ENABLE_X_DISCOVERY === 'true'
    && (isDevelopmentMockEnabled('USE_MOCK_X') || hasCredentials)
}

export async function fetchXPosts(query: string): Promise<NormalizedPost[]> {
  if (isDevelopmentMockEnabled('USE_MOCK_X')) {
    return [
      {
        platform: 'x',
        externalId: `mock-x-${Date.now()}`,
        author: 'mock_x_user',
        text: 'Just testing the new search functionality on X.',
        url: 'https://x.com/i/status/mock',
        createdAt: new Date().toISOString(),
        sourceTarget: query,
      }
    ]
  }

  if (!client) {
    throw new Error('X API keys missing in environment')
  }

  const results = await client.get<{
    data?: Array<{
      id: string
      author_id?: string
      text: string
      created_at?: string
    }>
  }>(
    'https://api.x.com/2/tweets/search/recent',
    {
      query,
      max_results: 25,
      'tweet.fields': 'created_at,author_id,text',
    },
    { timeout: 15_000 },
  )

  return (results.data || []).map(tweet => ({
    platform: 'x' as const,
    externalId: tweet.id,
    author: tweet.author_id ?? 'unknown',
    text: tweet.text,
    url: `https://x.com/i/status/${tweet.id}`,
    createdAt: tweet.created_at ?? new Date().toISOString(),
    sourceTarget: query,
  }))
}
