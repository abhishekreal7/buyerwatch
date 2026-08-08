const REDDIT_USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/
const REDDIT_POST_ID_PATTERN = /^[a-z0-9]{5,12}$/i
const REDDIT_COMMENT_ID_PATTERN = /^t1_[a-z0-9]+$/i
const MAX_COOKIE_LENGTH = 32_768

const OPTIONAL_COOKIE_NAMES = [
  'token_v2',
  'csrf_token',
  'edgebucket',
  'csv',
  'session_tracker',
  'pc',
] as const

export type RedditSessionCookies = {
  reddit_session: string
  loid: string
  token_v2?: string
  csrf_token?: string
  edgebucket?: string
  csv?: string
  session_tracker?: string
  pc?: string
}

export type RedditLoginResult = {
  username: string
  cookies: RedditSessionCookies
  linkKarma: number | null
  commentKarma: number | null
}

export type RedditCommentResult = {
  commentId: string
  permalink: string
}

export type RedditPostTarget = {
  subreddit: string
  postId: string
  canonicalUrl: string
}

export type RedditApisListingPost = {
  id: string
  author: string
  subreddit: string
  url: string
  createdAt: string | null
  locked: boolean
  stickied: boolean
  over18: boolean
}

export type RedditApisListingPage = {
  posts: RedditApisListingPost[]
  after: string | null
}

export class RedditApisContractError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'RedditApisContractError'
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function boundedString(value: unknown, maximum = MAX_COOKIE_LENGTH): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length <= maximum ? trimmed : ''
}

function finiteInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function safeRedditUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (
      url.protocol !== 'https:'
      || !(hostname === 'reddit.com' || hostname.endsWith('.reddit.com'))
    ) return null
    return url.toString()
  } catch {
    return null
  }
}

export function normalizeRedditUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/^u\//i, '')
  return REDDIT_USERNAME_PATTERN.test(normalized) ? normalized : null
}

export function parseRedditPostTarget(value: unknown): RedditPostTarget | null {
  const safeUrl = safeRedditUrl(value)
  if (!safeUrl) return null
  const url = new URL(safeUrl)
  const match = url.pathname.match(/^\/r\/([a-z0-9_]{2,50})\/comments\/([a-z0-9]{5,12})(?:\/|$)/i)
  if (!match || !REDDIT_POST_ID_PATTERN.test(match[2])) return null
  const subreddit = match[1]
  const postId = match[2].toLowerCase()
  return {
    subreddit,
    postId,
    canonicalUrl: `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/comments/${postId}/`,
  }
}

export function parseRedditLoginResponse(payload: unknown): RedditLoginResult {
  const root = asObject(payload)
  if (!root || root.success !== true) {
    throw new RedditApisContractError('reddit_login_rejected')
  }

  const username = normalizeRedditUsername(root.username)
  const rawCookies = asObject(root.cookies)
  const redditSession = boundedString(rawCookies?.reddit_session)
  const loid = boundedString(rawCookies?.loid)
  if (!username || !rawCookies || !redditSession || !loid) {
    throw new RedditApisContractError('reddit_login_response_invalid')
  }

  const cookies: RedditSessionCookies = {
    reddit_session: redditSession,
    loid,
  }
  for (const name of OPTIONAL_COOKIE_NAMES) {
    const value = boundedString(rawCookies[name])
    if (value) cookies[name] = value
  }

  return {
    username,
    cookies,
    linkKarma: finiteInteger(root.link_karma),
    commentKarma: finiteInteger(root.comment_karma),
  }
}

export function parseRedditCommentResponse(payload: unknown): RedditCommentResult {
  const root = asObject(payload)
  const commentId = boundedString(root?.comment_id, 64)
  const permalink = safeRedditUrl(root?.permalink)
  if (root?.success !== true || !REDDIT_COMMENT_ID_PATTERN.test(commentId) || !permalink) {
    throw new RedditApisContractError('reddit_comment_response_invalid')
  }
  return { commentId, permalink }
}

export function normalizeRedditApisListingPost(value: unknown): RedditApisListingPost | null {
  const post = asObject(value)
  if (!post) return null
  const id = boundedString(post.id, 32).toLowerCase()
  const author = boundedString(post.author, 64)
  const subreddit = boundedString(post.subreddit, 64)
  const url = safeRedditUrl(post.url)
  const rawCreated = boundedString(post.created, 64)
  const createdAt = rawCreated && Number.isFinite(Date.parse(rawCreated))
    ? new Date(rawCreated).toISOString()
    : typeof post.created_utc === 'number' && Number.isFinite(post.created_utc)
      ? new Date(post.created_utc * 1_000).toISOString()
      : null

  if (!REDDIT_POST_ID_PATTERN.test(id) || !author || !subreddit || !url) return null
  return {
    id,
    author,
    subreddit,
    url,
    createdAt,
    locked: post.locked === true,
    stickied: post.stickied === true,
    over18: post.over_18 === true,
  }
}

export function parseRedditApisListingPage(payload: unknown): RedditApisListingPage {
  const root = asObject(payload)
  const posts = Array.isArray(root?.posts) ? root.posts : []
  const rawAfter = boundedString(root?.after, 32)
  return {
    posts: posts.flatMap((post) => {
      const normalized = normalizeRedditApisListingPost(post)
      return normalized ? [normalized] : []
    }),
    after: /^t3_[a-z0-9]{5,12}$/i.test(rawAfter) ? rawAfter : null,
  }
}

export function parseRedditApisListing(payload: unknown): RedditApisListingPost[] {
  return parseRedditApisListingPage(payload).posts
}

export function providerMessageSignalsExpiredSession(payload: unknown): boolean {
  const root = asObject(payload)
  const message = [root?.error, root?.message, root?.detail]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
  return /(?:session|cookie|login|log in|expired|authentication)/.test(message)
}
