import { fetchWithTimeout, readResponseText } from './http'
import type { NormalizedPost } from './types'
import { isDevelopmentMockEnabled } from './env'

/** Discovery is app-only and never grants posting rights. */
export function isXDiscoveryConfigured(): boolean {
  return process.env.ENABLE_X_DISCOVERY === 'true'
    && (isDevelopmentMockEnabled('USE_MOCK_X') || Boolean(process.env.X_BEARER_TOKEN))
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

  const bearer = process.env.X_BEARER_TOKEN
  if (!bearer) throw new Error('x_discovery_not_configured')
  const params = new URLSearchParams({
    query, max_results: '25', 'tweet.fields': 'created_at,author_id,text', expansions: 'author_id', 'user.fields': 'username',
  })
  const response = await fetchWithTimeout(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
  }, 15_000)
  const raw = await readResponseText(response, 512_000)
  let results: { data?: Array<{ id: string; author_id?: string; text: string; created_at?: string }>; includes?: { users?: Array<{ id: string; username?: string }> }; errors?: Array<{ detail?: string }> }
  try { results = JSON.parse(raw) } catch { throw new Error('x_search_invalid_response') }
  if (!response.ok) throw new Error(`x_search_${response.status}:${results.errors?.[0]?.detail || 'request_failed'}`)
  const usernames = new Map((results.includes?.users ?? []).map(user => [user.id, user.username || user.id]))
  return (results.data || []).map(tweet => ({
    platform: 'x' as const,
    externalId: tweet.id,
    author: usernames.get(tweet.author_id || '') || tweet.author_id || 'unknown',
    text: tweet.text,
    url: `https://x.com/i/status/${tweet.id}`,
    createdAt: tweet.created_at ?? new Date().toISOString(),
    sourceTarget: query,
  }))
}
