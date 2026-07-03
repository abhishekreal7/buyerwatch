export type NormalizedPost = {
  platform: 'reddit' | 'bluesky' | 'x' | 'threads'
  externalId: string
  author: string
  text: string
  url: string
  createdAt: string
  sourceTarget: string // subreddit / search query that matched
}
