export type NormalizedPost = {
  platform: 'reddit' | 'bluesky' | 'x' | 'threads'
  externalId: string
  author: string
  title?: string   // post title (Reddit, X); undefined for reply-style platforms
  text: string
  url: string
  createdAt: string
  sourceTarget: string // subreddit / search query that matched
}
