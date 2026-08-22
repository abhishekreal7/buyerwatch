import { getConfiguredSecret } from './env'
import { fetchWithTimeout, readResponseText } from './http'
import { redis } from './redis'
import { normalizeRedditUsername, parseRedditPostTarget } from './redditapis-contract'
import type { NormalizedPost } from './types'

const MAX_RESPONSE_BYTES = 1_000_000
const MESSAGE_REFERENCE_TTL_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_LOOKBACK_MS = 48 * 60 * 60_000
const MAX_STREAM_ROWS = 1_000

type SprinklrConfig = {
  baseUrl: string
  apiKey: string
  accessToken: string
  topicId: string
  accountId: number
  channelId: string
  campaignId: string
  workspaceId?: string
}

type SprinklrMessageReference = {
  messageId: string
  postId: string
  postUrl: string
  authorChannelId: string
  authorScreenName?: string
  subreddit: string
  createdAt: string
  locked: boolean | null
  stickied: boolean | null
  over18: boolean | null
}

export type SprinklrRedditAccount = {
  accountId: number
  channelId: string
  username: string
}

export type SprinklrRedditPostSnapshot = {
  id: string
  subreddit: string
  author: string
  createdAt: string
  locked: boolean | null
  stickied: boolean | null
  over18: boolean | null
}

export class SprinklrRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
    public readonly deliveryUncertain = false,
  ) {
    super(code)
    this.name = 'SprinklrRequestError'
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function boundedString(value: unknown, maximum = 2_000): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length <= maximum ? trimmed : ''
}

function safeInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function optionalBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') return value
  }
  return null
}

function timestampToIso(value: number): string | null {
  try {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value
    const createdAt = new Date(milliseconds).toISOString()
    return Number.isFinite(Date.parse(createdAt)) ? createdAt : null
  } catch {
    return null
  }
}

function configuredBaseUrl(): string {
  const raw = process.env.SPRINKLR_API_BASE_URL?.trim() ?? ''
  try {
    const url = new URL(raw)
    if (
      url.protocol !== 'https:'
      || url.hostname.toLowerCase() !== 'api3.sprinklr.com'
      || url.search
      || url.hash
    ) return ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function getConfig(): SprinklrConfig {
  const baseUrl = configuredBaseUrl()
  const apiKey = getConfiguredSecret(process.env.SPRINKLR_API_KEY)
  const accessToken = getConfiguredSecret(process.env.SPRINKLR_ACCESS_TOKEN)
  const topicId = boundedString(process.env.SPRINKLR_REDDIT_TOPIC_ID, 200)
  const accountId = safeInteger(process.env.SPRINKLR_REDDIT_ACCOUNT_ID)
  const channelId = boundedString(process.env.SPRINKLR_REDDIT_CHANNEL_ID, 200)
  const campaignId = boundedString(process.env.SPRINKLR_REDDIT_CAMPAIGN_ID, 200)
  const workspaceId = boundedString(process.env.SPRINKLR_WORKSPACE_ID, 200)
  if (!baseUrl || !apiKey || !accessToken || !topicId || !accountId || !channelId || !campaignId) {
    throw new SprinklrRequestError('sprinklr_not_configured', null, false)
  }
  return {
    baseUrl,
    apiKey,
    accessToken,
    topicId,
    accountId,
    channelId,
    campaignId,
    ...(workspaceId ? { workspaceId } : {}),
  }
}

function headers(config: SprinklrConfig): Headers {
  const result = new Headers({
    Authorization: `Bearer ${config.accessToken}`,
    Key: config.apiKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  })
  if (config.workspaceId) result.set('workspace_id', config.workspaceId)
  return result
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const raw = await readResponseText(response, MAX_RESPONSE_BYTES)
    return raw.trim() ? JSON.parse(raw) as unknown : null
  } catch {
    return null
  }
}

async function sprinklrFetchJson(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<{ response: Response; payload: unknown }> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new SprinklrRequestError('sprinklr_path_invalid', null, false)
  }
  const config = getConfig()
  try {
    const response = await fetchWithTimeout(
      `${config.baseUrl}${path}`,
      { ...init, headers: headers(config) },
      timeoutMs,
    )
    return { response, payload: await readJson(response) }
  } catch (error) {
    if (error instanceof SprinklrRequestError) throw error
    throw new SprinklrRequestError('sprinklr_unreachable', null, true)
  }
}

function responseError(response: Response, operation: string): SprinklrRequestError {
  if (response.status === 401 || response.status === 403) {
    return new SprinklrRequestError('sprinklr_authentication_failed', response.status, false)
  }
  if (response.status === 429 || response.status >= 500) {
    return new SprinklrRequestError(`${operation}_temporarily_unavailable`, response.status, true)
  }
  return new SprinklrRequestError(`${operation}_rejected`, response.status, false)
}

function streamRows(payload: unknown): unknown[] {
  const root = asObject(payload)
  const response = asObject(root?.response)
  return Array.isArray(response?.data) ? response.data : []
}

function messageReferenceKey(postId: string): string {
  return `sprinklr:reddit:message:v1:${postId}`
}

function parseMessageReference(value: unknown): SprinklrMessageReference | null {
  const message = asObject(value)
  if (!message) return null
  const sourceType = boundedString(message.sourceType, 32).toUpperCase()
  const sourceId = safeInteger(message.sourceId)
  const channelType = boundedString(message.snType ?? message.channelType, 32).toUpperCase()
  const messageType = safeInteger(message.messageType)
  const channelMessageId = boundedString(message.snMsgId ?? message.channelMessageId, 200)
  const channelCreatedTime = safeInteger(message.snCreatedTime ?? message.channelCreatedTime)
  const postUrl = boundedString(message.permalink, 2_000)
  const target = parseRedditPostTarget(postUrl)
  const sender = asObject(message.senderProfile)
  const additional = asObject(message.additionalInformation)
  const authorChannelId = boundedString(sender?.snId ?? sender?.channelId, 200)
  const authorScreenName = boundedString(sender?.screenName ?? sender?.username, 64)
  const redditPostId = channelMessageId.replace(/^t3_/i, '').toLowerCase()
  const createdAt = channelCreatedTime === null ? null : timestampToIso(channelCreatedTime)
  if (
    !['ACCOUNT', 'PERSISTENT_SEARCH', 'LISTENING'].includes(sourceType)
    || sourceId === null
    || channelType !== 'REDDIT'
    || messageType === null
    || !channelMessageId
    || channelCreatedTime === null
    || !target
    || redditPostId !== target.postId
    || !authorChannelId
    || !createdAt
  ) return null

  return {
    messageId: [
      sourceType,
      sourceId,
      channelCreatedTime,
      channelType,
      messageType,
      channelMessageId,
    ].join('_'),
    postId: target.postId,
    postUrl: target.canonicalUrl,
    authorChannelId,
    ...(authorScreenName ? { authorScreenName } : {}),
    subreddit: target.subreddit,
    createdAt,
    locked: optionalBoolean(message.locked, additional?.locked, additional?.isLocked),
    stickied: optionalBoolean(message.stickied, additional?.stickied, additional?.isStickied),
    over18: optionalBoolean(message.over18, message.over_18, additional?.over18, additional?.isNsfw),
  }
}

function normalizeMessage(value: unknown, subreddit: string): NormalizedPost | null {
  const message = asObject(value)
  const reference = parseMessageReference(value)
  if (!message || !reference) return null
  const target = parseRedditPostTarget(reference.postUrl)
  if (!target || target.subreddit.toLowerCase() !== subreddit.toLowerCase()) return null
  const sender = asObject(message.senderProfile)
  const author = boundedString(sender?.screenName ?? sender?.username ?? sender?.name, 64)
    .replace(/^u\//i, '')
  const text = boundedString(message.message ?? asObject(message.content)?.text, 100_000)
  if (!author || !text) return null
  return {
    platform: 'reddit',
    externalId: reference.postId,
    author,
    text,
    url: reference.postUrl,
    createdAt: reference.createdAt,
    sourceTarget: subreddit,
  }
}

async function fetchStream(lookbackMs = DEFAULT_LOOKBACK_MS): Promise<unknown[]> {
  const config = getConfig()
  const until = Date.now()
  const since = until - Math.max(5 * 60_000, Math.min(7 * 24 * 60 * 60_000, lookbackMs))
  const { response, payload } = await sprinklrFetchJson('/api/v1/listening/query/stream', {
    method: 'POST',
    body: JSON.stringify({
      sinceTime: String(since),
      untilTime: String(until),
      details: { widgetType: 'STREAM' },
      filters: [{ dimension: 'TOPIC', filterValues: [config.topicId] }],
      metric: 'MENTIONS',
      timezoneOffset: 0,
      rows: MAX_STREAM_ROWS,
      start: 1,
    }),
  })
  if (!response.ok) throw responseError(response, 'sprinklr_listening')
  if (boundedString(asObject(payload)?.status, 32).toUpperCase() !== 'SUCCESS') {
    throw new SprinklrRequestError('sprinklr_listening_contract_invalid', response.status, false)
  }
  return streamRows(payload)
}

async function cacheReference(reference: SprinklrMessageReference): Promise<void> {
  await redis.set(
    messageReferenceKey(reference.postId),
    JSON.stringify(reference),
    'EX',
    MESSAGE_REFERENCE_TTL_SECONDS,
  ).catch(() => undefined)
}

function validateCachedReference(value: unknown, postId: string): SprinklrMessageReference | null {
  const reference = asObject(value)
  const messageId = boundedString(reference?.messageId, 1_000)
  const storedPostId = boundedString(reference?.postId, 32).toLowerCase()
  const postUrl = boundedString(reference?.postUrl, 2_000)
  const authorChannelId = boundedString(reference?.authorChannelId, 200)
  const authorScreenName = boundedString(reference?.authorScreenName, 64)
  const subreddit = boundedString(reference?.subreddit, 50)
  const createdAt = boundedString(reference?.createdAt, 64)
  const target = parseRedditPostTarget(postUrl)
  if (
    !messageId
    || storedPostId !== postId
    || target?.postId !== postId
    || !authorChannelId
    || subreddit.toLowerCase() !== target.subreddit.toLowerCase()
    || !Number.isFinite(Date.parse(createdAt))
  ) return null
  return {
    messageId,
    postId,
    postUrl: target.canonicalUrl,
    authorChannelId,
    ...(authorScreenName ? { authorScreenName } : {}),
    subreddit: target.subreddit,
    createdAt: new Date(createdAt).toISOString(),
    locked: optionalBoolean(reference?.locked),
    stickied: optionalBoolean(reference?.stickied),
    over18: optionalBoolean(reference?.over18),
  }
}

async function findMessageReference(postId: string): Promise<SprinklrMessageReference> {
  try {
    const raw = await redis.get(messageReferenceKey(postId))
    if (raw) {
      const cached = validateCachedReference(JSON.parse(raw) as unknown, postId)
      if (cached) return cached
    }
  } catch {
    // The listening stream is the bounded source of truth when cache is absent.
  }
  const rows = await fetchStream()
  for (const row of rows) {
    const reference = parseMessageReference(row)
    if (reference?.postId === postId) {
      await cacheReference(reference)
      return reference
    }
  }
  throw new SprinklrRequestError('sprinklr_reddit_message_not_found', 404, false)
}

export async function fetchSprinklrRedditPosts(
  subreddit: string,
  limit: number,
): Promise<NormalizedPost[]> {
  const normalizedSubreddit = subreddit.trim().replace(/^r\//i, '').toLowerCase()
  if (!/^[a-z0-9_]{2,50}$/.test(normalizedSubreddit)) {
    throw new SprinklrRequestError('sprinklr_subreddit_invalid', null, false)
  }
  const boundedLimit = Math.min(100, Math.max(1, Math.floor(limit)))
  const rows = await fetchStream()
  const posts: NormalizedPost[] = []
  for (const row of rows) {
    const post = normalizeMessage(row, normalizedSubreddit)
    const reference = parseMessageReference(row)
    if (!post || !reference) continue
    await cacheReference(reference)
    posts.push(post)
    if (posts.length >= boundedLimit) break
  }
  return posts
}

export async function fetchSprinklrRedditPostSnapshot(
  postUrl: string,
): Promise<SprinklrRedditPostSnapshot> {
  const target = parseRedditPostTarget(postUrl)
  if (!target) throw new SprinklrRequestError('sprinklr_reddit_reply_invalid', null, false)
  const reference = await findMessageReference(target.postId)
  return {
    id: reference.postId,
    subreddit: reference.subreddit,
    author: reference.authorScreenName ?? '',
    createdAt: reference.createdAt,
    locked: reference.locked,
    stickied: reference.stickied,
    over18: reference.over18,
  }
}

export async function fetchSprinklrRedditAccount(): Promise<SprinklrRedditAccount> {
  const config = getConfig()
  const { response, payload } = await sprinklrFetchJson(`/api/v2/account/${config.accountId}`)
  if (!response.ok) throw responseError(response, 'sprinklr_account')
  const account = asObject(asObject(payload)?.data)
  const id = safeInteger(account?.id)
  const channelId = boundedString(account?.channelId, 200)
  const channelType = boundedString(account?.channelType ?? account?.type, 32).toUpperCase()
  const username = normalizeRedditUsername(account?.displayName)
  if (
    id !== config.accountId
    || channelId !== config.channelId
    || channelType !== 'REDDIT'
    || account?.active !== true
    || account?.deleted === true
    || !username
  ) {
    throw new SprinklrRequestError('sprinklr_reddit_account_invalid', response.status, false)
  }
  return { accountId: id, channelId, username }
}

function parsePublishedPostId(payload: unknown): string | null {
  const data = asObject(payload)?.data
  if (!Array.isArray(data) || data.length !== 1) return null
  const value = boundedString(data[0], 64)
  const match = value.match(/^POST_(\d{1,20})$/)
  return match?.[1] ?? null
}

function findRedditCommentPermalink(value: unknown, postId: string): string | null {
  if (typeof value === 'string') {
    try {
      const url = new URL(value)
      const host = url.hostname.toLowerCase()
      if (url.protocol !== 'https:' || !(host === 'reddit.com' || host.endsWith('.reddit.com'))) return null
      const match = url.pathname.match(/^\/r\/[a-z0-9_]{2,50}\/comments\/([a-z0-9]{5,12})\/(?:[^/]+\/)?([a-z0-9]{5,12})(?:\/|$)/i)
      return match?.[1]?.toLowerCase() === postId && match[2].toLowerCase() !== postId
        ? url.toString()
        : null
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findRedditCommentPermalink(child, postId)
      if (found) return found
    }
  } else {
    const object = asObject(value)
    if (object) {
      for (const child of Object.values(object)) {
        const found = findRedditCommentPermalink(child, postId)
        if (found) return found
      }
    }
  }
  return null
}

function publishingStatus(payload: unknown): string {
  const visit = (value: unknown): string => {
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = visit(child)
        if (found) return found
      }
      return ''
    }
    const object = asObject(value)
    if (!object) return ''
    const status = boundedString(object.status, 32).toUpperCase()
    if (status) return status
    for (const child of Object.values(object)) {
      const found = visit(child)
      if (found) return found
    }
    return ''
  }
  return visit(payload)
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

export async function postSprinklrRedditReply(input: {
  postUrl: string
  text: string
  accountId: number
  channelId: string
}): Promise<{ permalink: string }> {
  const target = parseRedditPostTarget(input.postUrl)
  if (!target || !input.text.trim() || input.text.length > 10_000) {
    throw new SprinklrRequestError('sprinklr_reddit_reply_invalid', null, false)
  }
  const config = getConfig()
  if (input.accountId !== config.accountId || input.channelId !== config.channelId) {
    throw new SprinklrRequestError('sprinklr_account_mapping_mismatch', null, false)
  }
  const reference = await findMessageReference(target.postId)
  let response: Response
  let payload: unknown
  try {
    const result = await sprinklrFetchJson('/api/v2/publishing/reply', {
      method: 'POST',
      body: JSON.stringify({
        accountId: config.accountId,
        content: { text: input.text },
        taxonomy: { campaignId: config.campaignId },
        channelOptions: { channelType: 'REDDIT' },
        inReplyToMessageId: reference.messageId,
        toProfile: {
          channelType: 'REDDIT',
          channelId: reference.authorChannelId,
          ...(reference.authorScreenName ? { screenName: reference.authorScreenName } : {}),
        },
      }),
    }, 30_000)
    response = result.response
    payload = result.payload
  } catch (error) {
    if (error instanceof SprinklrRequestError && error.code === 'sprinklr_unreachable') {
      throw new SprinklrRequestError('sprinklr_delivery_outcome_unknown', null, false, true)
    }
    throw error
  }
  if (!response.ok) {
    if (response.status >= 500) {
      throw new SprinklrRequestError(
        'sprinklr_delivery_outcome_unknown',
        response.status,
        false,
        true,
      )
    }
    throw responseError(response, 'sprinklr_delivery')
  }
  const publishedPostId = parsePublishedPostId(payload)
  if (!publishedPostId) {
    throw new SprinklrRequestError('sprinklr_delivery_outcome_unknown', response.status, false, true)
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await wait(750)
    const confirmation = await sprinklrFetchJson(
      `/api/v2/publishing/posts?postIds=${encodeURIComponent(publishedPostId)}`,
      { method: 'GET' },
    ).catch(() => null)
    if (!confirmation) continue
    if (!confirmation.response.ok) continue
    const permalink = findRedditCommentPermalink(confirmation.payload, target.postId)
    if (permalink) return { permalink }
    const status = publishingStatus(confirmation.payload)
    if (status === 'FAILED' || status === 'REJECTED') {
      throw new SprinklrRequestError('sprinklr_delivery_rejected', confirmation.response.status, false)
    }
  }

  // Sprinklr accepted the write, but BuyerWatch could not prove the native
  // Reddit URL. Never retry an ambiguous write or claim it was delivered.
  throw new SprinklrRequestError('sprinklr_delivery_outcome_unknown', response.status, false, true)
}
