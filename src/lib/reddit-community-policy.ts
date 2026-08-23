import { hasDisclosure, mentionsProduct } from './reply-quality'
import { redditApisFetchJson } from './redditapis-client'
import { redis } from './redis'

const SUBREDDIT_PATTERN = /^[a-z0-9_]{2,50}$/i
const POLICY_CACHE_TTL_SECONDS = 15 * 60
const POLICY_CACHE_TTL_MS = POLICY_CACHE_TTL_SECONDS * 1_000
const MAX_EVIDENCE_ITEMS = 4

const PROMOTION_TERMS = '(?:self[-\\s]?promo(?:tion)?|promotions?|promotional(?:\\s+(?:content|posts?))?|advertis(?:e|ing|ement)s?|solicit(?:ation|ing)?|marketing|commercial(?:\\s+(?:content|posts?))?|selling)'
const PROMOTION_THREAD_PATTERNS = [
  new RegExp(`${PROMOTION_TERMS}[\\s\\S]{0,100}\\b(?:only|except|unless|must|please use|belongs in|go in|post in)\\b[\\s\\S]{0,100}\\b(?:weekly|monthly|daily|pinned|sticky|mega(?:thread)?|thread)\\b`, 'i'),
  new RegExp(`\\b(?:weekly|monthly|daily|pinned|sticky|mega(?:thread)?|thread)\\b[\\s\\S]{0,100}\\b(?:only|except|unless|must|please use|belongs in|go in|post in)\\b[\\s\\S]{0,100}${PROMOTION_TERMS}`, 'i'),
  new RegExp(`${PROMOTION_TERMS}[\\s\\S]{0,80}\\b(?:allowed|permitted|welcome)\\b[\\s\\S]{0,80}\\b(?:weekly|monthly|daily|pinned|sticky|mega(?:thread)?|thread)\\b`, 'i'),
]
const NO_PROMOTION_PATTERNS = [
  new RegExp(`\\b(?:no|without)\\s+${PROMOTION_TERMS}\\b`, 'i'),
  new RegExp(`${PROMOTION_TERMS}(?:\\s+(?:and|or)\\s+${PROMOTION_TERMS}){0,3}\\s*(?:is|are)?\\s*(?:not\\s+(?:allowed|permitted)|prohibited|forbidden|banned)\\b`, 'i'),
  new RegExp(`\\b(?:do not|don't|must not|cannot|can't)\\s+(?:self[-\\s]?promote|advertis(?:e|ing)|market|solicit)\\b`, 'i'),
]
const EXPLICIT_PROMOTION_ALLOW_PATTERNS = [
  new RegExp(`${PROMOTION_TERMS}[\\s\\S]{0,60}\\b(?:is|are)?\\s*(?:allowed|permitted|welcome)\\b`, 'i'),
  /\b(?:you|members|users)\s+(?:may|can)\b[\s\S]{0,60}\b(?:promote|advertise|market|share your (?:product|project|startup))\b/i,
]
const NO_LINK_PATTERNS = [
  /\b(?:no|without)\s+(?:external\s+)?links?\b/i,
  /\b(?:links?|urls?)\s+(?:are\s+)?(?:not\s+(?:allowed|permitted)|prohibited|forbidden)\b/i,
  /\b(?:do not|don't|must not|cannot|can't)\s+(?:post|share|include)\s+(?:external\s+)?links?\b/i,
]
const ACCOUNT_OR_APPROVAL_PATTERNS = [
  /\b(?:minimum|min\.?|at least)\b[\s\S]{0,70}\b(?:karma|account\s+age|days?\s+old|weeks?\s+old|months?\s+old)\b/i,
  /\b(?:moderator|mod)\s+approval\b/i,
  /\b(?:approved\s+user|modmail|verification|verified\s+account|required\s+flair|flair\s+required)\b/i,
]
const PROMOTION_THREAD_TITLE_PATTERN = /\b(?:self[-\s]?promo(?:tion)?|promotions?|show(?:\s+and\s+)?tell|showcase|feedback\s+friday|marketing\s+monday|share\s+(?:your\s+)?(?:startup|product|project))\b/i
const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>()]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|in|co|ai|app|dev|xyz|me|tech|so|ly|gg|us|uk|info|biz)(?:\/[^\s<>()]*)?/gi

export type CommunityPolicyStatus =
  | 'explicitly_allowed'
  | 'allowed_without_links'
  | 'promotion_thread_only'
  | 'promotion_prohibited'
  | 'manual_review'
  | 'unavailable'

export type CommunityPolicyEvidence = {
  source: 'rule' | 'sidebar' | 'pinned_thread'
  text: string
}

export type PromotionThread = {
  title: string
  url: string
}

export type SubredditCommunityPolicy = {
  version: 1
  subreddit: string
  status: CommunityPolicyStatus
  label: string
  message: string
  reasonCode: string
  checkedAt: string
  expiresAt: string
  rulesUrl: string
  evidence: CommunityPolicyEvidence[]
  promotionThread: PromotionThread | null
}

export type RedditReplyPolicyDecision = {
  outcome: 'auto_send_allowed' | 'manual_review_required' | 'blocked'
  reason: string
  message: string
  commercialReference: boolean
  hasExternalLink: boolean
  hasBusinessLink: boolean
  mentionedProduct: boolean
  hasDisclosure: boolean
  policy: SubredditCommunityPolicy
}

type SourceDocument = CommunityPolicyEvidence
type JsonObject = Record<string, unknown>
type CachedPolicy = SubredditCommunityPolicy

const memoryCache = new Map<string, CachedPolicy>()

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function truncate(value: string, maximum = 420): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > maximum
    ? `${normalized.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`
    : normalized
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text))
}

function cacheKey(subreddit: string): string {
  return `reddit-community-policy:v2:${subreddit}`
}

function policyIsFresh(policy: CachedPolicy): boolean {
  return Date.parse(policy.expiresAt) > Date.now()
}

async function readCachedPolicy(subreddit: string): Promise<CachedPolicy | null> {
  const key = cacheKey(subreddit)
  const memoryValue = memoryCache.get(key)
  if (memoryValue && policyIsFresh(memoryValue)) return memoryValue
  if (memoryValue) memoryCache.delete(key)

  if (!process.env.UPSTASH_REDIS_URL) return null
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPolicy
    if (!policyIsFresh(parsed)) return null
    memoryCache.set(key, parsed)
    return parsed
  } catch {
    // A cache outage must never become permission to post. We simply refresh
    // from Reddit and will return an unavailable/manual verdict on failure.
    return null
  }
}

async function writeCachedPolicy(policy: CachedPolicy): Promise<void> {
  const key = cacheKey(policy.subreddit)
  if (memoryCache.size >= 200) {
    const oldest = memoryCache.keys().next().value
    if (oldest) memoryCache.delete(oldest)
  }
  memoryCache.set(key, policy)

  if (!process.env.UPSTASH_REDIS_URL) return
  try {
    await redis.set(key, JSON.stringify(policy), 'EX', POLICY_CACHE_TTL_SECONDS)
  } catch {
    // The in-process cache is enough for this invocation. Rule retrieval still
    // remains fail-closed if Redis is unavailable on the next invocation.
  }
}

export function normalizeSubreddit(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value
    .trim()
    .replace(/^\/?r\//i, '')
    .replace(/^\/+|\/+$/g, '')

  if (!SUBREDDIT_PATTERN.test(normalized)) return null
  return normalized.toLowerCase()
}

export function extractSubredditFromRedditUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (!(hostname === 'reddit.com' || hostname.endsWith('.reddit.com'))) return null
    const match = url.pathname.match(/^\/r\/([a-z0-9_]{2,50})(?:\/|$)/i)
    return normalizeSubreddit(match?.[1])
  } catch {
    return null
  }
}

function makePolicy(
  subreddit: string,
  status: CommunityPolicyStatus,
  reasonCode: string,
  evidence: CommunityPolicyEvidence[] = [],
  promotionThread: PromotionThread | null = null,
  messageOverride?: string,
): SubredditCommunityPolicy {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + POLICY_CACHE_TTL_MS)
  const statusPresentation: Record<CommunityPolicyStatus, { label: string; message: string }> = {
    explicitly_allowed: {
      label: 'Promotion permitted',
      message: `r/${subreddit} explicitly permits promotional participation under its published rules.`,
    },
    allowed_without_links: {
      label: 'No external links',
      message: `r/${subreddit} permits promotion but its published rules restrict external links.`,
    },
    promotion_thread_only: {
      label: 'Promo thread only',
      message: `r/${subreddit} directs promotional content to a dedicated promotion thread, not ordinary replies.`,
    },
    promotion_prohibited: {
      label: 'Promotion restricted',
      message: `r/${subreddit} prohibits self-promotion, advertising, or commercial solicitation.`,
    },
    manual_review: {
      label: 'Manual review required',
      message: `r/${subreddit} does not clearly permit automated commercial replies.`,
    },
    unavailable: {
      label: 'Rules check unavailable',
      message: `We couldn't verify r/${subreddit}'s current rules, so automated posting is paused. Review the rules before posting.`,
    },
  }
  const presentation = statusPresentation[status]

  return {
    version: 1,
    subreddit,
    status,
    label: presentation.label,
    message: messageOverride ?? presentation.message,
    reasonCode,
    checkedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    rulesUrl: `https://www.reddit.com/r/${subreddit}/about/rules/`,
    evidence: evidence.slice(0, MAX_EVIDENCE_ITEMS),
    promotionThread,
  }
}

function evidenceForDocuments(
  documents: SourceDocument[],
  patterns: readonly RegExp[],
): CommunityPolicyEvidence[] {
  return documents
    .filter(document => matchesAny(document.text, patterns))
    .map(document => ({ ...document, text: truncate(document.text) }))
    .slice(0, MAX_EVIDENCE_ITEMS)
}

function decodeRules(payload: unknown): SourceDocument[] {
  const root = asObject(payload)
  if (!root) return []
  const candidates = [root.rules, asObject(root.data)?.rules]
  const rules = candidates.find(Array.isArray) as unknown[] | undefined
  if (!rules) return []

  return rules.flatMap((rule) => {
    const value = asObject(rule)
    if (!value) return []
    const text = [
      asString(value.short_name) || asString(value.name),
      asString(value.description),
      asString(value.violation_reason),
    ].filter(Boolean).join('\n')
    return text ? [{ source: 'rule' as const, text }] : []
  })
}

function decodeSidebar(payload: unknown): { documents: SourceDocument[]; communityType: string } {
  const root = asObject(payload)
  const data = asObject(root?.data) ?? root
  if (!data) return { documents: [], communityType: '' }
  const text = [
    asString(data.public_description),
    asString(data.description),
  ].filter(Boolean).join('\n')
  return {
    documents: text ? [{ source: 'sidebar', text }] : [],
    communityType: asString(data.subreddit_type).toLowerCase(),
  }
}

function decodeListingPosts(payload: unknown): JsonObject[] {
  const root = asObject(payload)
  const data = asObject(root?.data)
  const children = Array.isArray(data?.children) ? data.children : []
  if (children.length > 0) {
    return children.flatMap(child => {
      const post = asObject(asObject(child)?.data)
      return post ? [post] : []
    })
  }
  return Array.isArray(root?.posts)
    ? root.posts.flatMap(post => {
        const value = asObject(post)
        return value ? [value] : []
      })
    : []
}

function decodePinnedPromotionThreads(payload: unknown): PromotionThread[] {
  const posts = decodeListingPosts(payload)

  return posts.flatMap((post) => {
    if (post.stickied !== true) return []
    const title = asString(post.title)
    const body = asString(post.selftext) || asString(post.text)
    if (!PROMOTION_THREAD_TITLE_PATTERN.test(`${title}\n${body}`)) return []
    const permalink = asString(post.permalink)
    const url = permalink.startsWith('/')
      ? `https://www.reddit.com${permalink}`
      : asString(post.url)
    return title && url ? [{ title: truncate(title, 180), url }] : []
  })
}

function decodePinnedDocuments(payload: unknown): SourceDocument[] {
  return decodeListingPosts(payload).flatMap((post) => {
    if (post.stickied !== true) return []
    const text = [asString(post.title), asString(post.selftext) || asString(post.text)].filter(Boolean).join('\n')
    return text ? [{ source: 'pinned_thread' as const, text }] : []
  })
}

type JsonFetchResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number | null; reason: string }

async function fetchRedditJson(path: string): Promise<JsonFetchResult> {
  try {
    const { response, payload } = await redditApisFetchJson(path, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
    }, 8_000)
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: `reddit_http_${response.status}`,
      }
    }
    return { ok: true, value: payload }
  } catch (error) {
    return {
      ok: false,
      status: null,
      reason: error instanceof Error ? error.message.slice(0, 120) : 'reddit_fetch_failed',
    }
  }
}

export function classifySubredditCommunityPolicy(input: {
  subreddit: string
  rules: unknown
  about: unknown | null
  hot: unknown | null
  incompleteSources: boolean
}): SubredditCommunityPolicy {
  const ruleDocuments = decodeRules(input.rules)
  const sidebar = input.about ? decodeSidebar(input.about) : { documents: [], communityType: '' }
  const pinnedDocuments = input.hot ? decodePinnedDocuments(input.hot) : []
  const documents = [...ruleDocuments, ...sidebar.documents, ...pinnedDocuments]
  const combined = documents.map(document => document.text).join('\n\n')
  const promotionThread = input.hot
    ? decodePinnedPromotionThreads(input.hot)[0] ?? null
    : null

  if (sidebar.communityType === 'private') {
    return makePolicy(
      input.subreddit,
      'manual_review',
      'private_community',
      evidenceForDocuments(documents, ACCOUNT_OR_APPROVAL_PATTERNS),
      promotionThread,
      `r/${input.subreddit} is private. BuyerWatch will not automate a commercial reply there.`,
    )
  }

  if (matchesAny(combined, PROMOTION_THREAD_PATTERNS)) {
    return makePolicy(
      input.subreddit,
      'promotion_thread_only',
      'promotion_thread_only',
      evidenceForDocuments(documents, PROMOTION_THREAD_PATTERNS),
      promotionThread,
    )
  }

  if (matchesAny(combined, NO_PROMOTION_PATTERNS)) {
    return makePolicy(
      input.subreddit,
      'promotion_prohibited',
      'promotion_prohibited',
      evidenceForDocuments(documents, NO_PROMOTION_PATTERNS),
      promotionThread,
    )
  }

  if (matchesAny(combined, ACCOUNT_OR_APPROVAL_PATTERNS)) {
    return makePolicy(
      input.subreddit,
      'manual_review',
      'account_or_mod_approval_required',
      evidenceForDocuments(documents, ACCOUNT_OR_APPROVAL_PATTERNS),
      promotionThread,
      `r/${input.subreddit} has account, flair, verification, or moderator-approval requirements that need a human check.`,
    )
  }

  const explicitlyAllowed = matchesAny(combined, EXPLICIT_PROMOTION_ALLOW_PATTERNS)
  const noLinks = matchesAny(combined, NO_LINK_PATTERNS)

  if (input.incompleteSources) {
    return makePolicy(
      input.subreddit,
      'manual_review',
      'policy_sources_incomplete',
      [],
      promotionThread,
      `BuyerWatch could not fully inspect r/${input.subreddit}'s sidebar or pinned threads, so automated delivery is paused.`,
    )
  }

  if (explicitlyAllowed && noLinks) {
    return makePolicy(
      input.subreddit,
      'allowed_without_links',
      'promotion_allowed_without_links',
      evidenceForDocuments(documents, [...EXPLICIT_PROMOTION_ALLOW_PATTERNS, ...NO_LINK_PATTERNS]),
      promotionThread,
    )
  }

  if (explicitlyAllowed) {
    return makePolicy(
      input.subreddit,
      'explicitly_allowed',
      'promotion_explicitly_allowed',
      evidenceForDocuments(documents, EXPLICIT_PROMOTION_ALLOW_PATTERNS),
      promotionThread,
    )
  }

  return makePolicy(
    input.subreddit,
    'manual_review',
    'no_explicit_promotion_permission',
    promotionThread
      ? [{ source: 'pinned_thread', text: `Pinned discussion: ${promotionThread.title}` }]
      : [],
    promotionThread,
  )
}

function unavailablePolicy(
  subreddit: string,
  result: Extract<JsonFetchResult, { ok: false }>,
): SubredditCommunityPolicy {
  const denied = result.status === 401 || result.status === 403
  return makePolicy(
    subreddit,
    'unavailable',
    denied
      ? 'reddit_provider_authentication_failed'
      : 'reddit_rules_unavailable',
    [],
    null,
    denied
      ? 'The Reddit data provider denied the rules request, so automated Reddit delivery is paused.'
      : `BuyerWatch could not verify r/${subreddit}'s current rules, so automated Reddit delivery is paused.`,
  )
}

/**
 * Retrieve rules, sidebar guidance, and current pinned threads through the
 * connected Reddit account. Any failed or ambiguous inspection remains manual
 * review-only; no network failure is ever treated as permission to auto-post.
 */
export async function getSubredditCommunityPolicy(
  _userId: string,
  target: string,
  options: { forceRefresh?: boolean } = {},
): Promise<SubredditCommunityPolicy> {
  const subreddit = normalizeSubreddit(target)
  if (!subreddit) {
    return makePolicy(
      'unknown',
      'unavailable',
      'invalid_subreddit',
      [],
      null,
      'BuyerWatch could not identify a valid subreddit for this conversation, so automated Reddit delivery is paused.',
    )
  }

  if (!options.forceRefresh) {
    const cached = await readCachedPolicy(subreddit)
    if (cached) return cached
  }

  const rules = await fetchRedditJson(`/api/reddit/sub/${encodeURIComponent(subreddit)}/rules`)
  if (rules.ok === false) {
    const policy = unavailablePolicy(subreddit, rules)
    await writeCachedPolicy(policy)
    return policy
  }

  // Fetch sequentially to keep provider usage predictable and fail closed if
  // either public policy source cannot be inspected.
  const about = await fetchRedditJson(`/api/reddit/sub/${encodeURIComponent(subreddit)}/about`)
  const hotParams = new URLSearchParams({ subreddit, sort: 'hot', limit: '10' })
  const hot = await fetchRedditJson(`/api/reddit/posts?${hotParams.toString()}`)
  const policy = classifySubredditCommunityPolicy({
    subreddit,
    rules: rules.value,
    about: about.ok ? about.value : null,
    hot: hot.ok ? hot.value : null,
    incompleteSources: !about.ok || !hot.ok,
  })
  await writeCachedPolicy(policy)
  return policy
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '')
}

function getBusinessHost(businessUrl: string | null | undefined): string | null {
  if (!businessUrl) return null
  try {
    return normalizeHost(new URL(businessUrl).hostname)
  } catch {
    return null
  }
}

function getTextLinks(text: string): string[] {
  const matcher = new RegExp(LINK_PATTERN.source, LINK_PATTERN.flags)
  return [...text.matchAll(matcher)]
    .map(match => match[0].replace(/[),.!?;:]+$/g, ''))
    .filter(Boolean)
}

function containsBusinessLink(text: string, businessUrl: string | null | undefined): boolean {
  const businessHost = getBusinessHost(businessUrl)
  if (!businessHost) return false
  const normalized = text.toLowerCase()
  if (normalized.includes(businessHost)) return true
  return getTextLinks(text).some((candidate) => {
    try {
      const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`
      const host = normalizeHost(new URL(withProtocol).hostname)
      return host === businessHost || host.endsWith(`.${businessHost}`)
    } catch {
      return false
    }
  })
}

export function evaluateRedditReplyPolicy(
  policy: SubredditCommunityPolicy,
  input: {
    text: string
    businessName: string
    businessUrl?: string | null
  },
): RedditReplyPolicyDecision {
  const mentionedProduct = mentionsProduct(input.text, input.businessName)
  const hasBusinessLink = containsBusinessLink(input.text, input.businessUrl)
  const hasExternalLink = getTextLinks(input.text).length > 0
  const disclosure = hasDisclosure(input.text)
  const commercialReference = mentionedProduct || hasBusinessLink || (hasExternalLink && disclosure)

  const decision = (
    outcome: RedditReplyPolicyDecision['outcome'],
    reason: string,
    message: string,
  ): RedditReplyPolicyDecision => ({
    outcome,
    reason,
    message,
    commercialReference,
    hasExternalLink,
    hasBusinessLink,
    mentionedProduct,
    hasDisclosure: disclosure,
    policy,
  })

  if (commercialReference && !disclosure) {
    return decision(
      'blocked',
      'reddit_policy_missing_disclosure',
      'A commercial Reddit reply needs a clear affiliation disclosure before it can be sent.',
    )
  }

  switch (policy.status) {
    case 'explicitly_allowed':
      return decision('auto_send_allowed', 'reddit_policy_allowed', policy.message)
    case 'allowed_without_links':
      if (hasExternalLink) {
        return decision(
          'blocked',
          'reddit_policy_no_external_links',
          `r/${policy.subreddit} restricts external links. Remove the link or review the community rules manually.`,
        )
      }
      return decision('auto_send_allowed', 'reddit_policy_allowed_without_links', policy.message)
    case 'promotion_prohibited':
      return commercialReference
        ? decision('blocked', 'reddit_policy_promotion_prohibited', policy.message)
        : decision('manual_review_required', 'reddit_policy_promotion_restricted', policy.message)
    case 'promotion_thread_only':
      return commercialReference
        ? decision('blocked', 'reddit_policy_promotion_thread_only', policy.message)
        : decision('manual_review_required', 'reddit_policy_promotion_thread_only', policy.message)
    case 'manual_review':
      return decision('manual_review_required', 'reddit_policy_manual_review', policy.message)
    case 'unavailable':
      return decision('manual_review_required', 'reddit_policy_unavailable', policy.message)
  }
}

export function toCommunityPolicyAudit(
  decision: RedditReplyPolicyDecision | null | undefined,
): Record<string, unknown> | undefined {
  if (!decision) return undefined
  return {
    subreddit: decision.policy.subreddit,
    status: decision.policy.status,
    reasonCode: decision.policy.reasonCode,
    outcome: decision.outcome,
    reason: decision.reason,
    commercialReference: decision.commercialReference,
    hasExternalLink: decision.hasExternalLink,
    hasBusinessLink: decision.hasBusinessLink,
    mentionedProduct: decision.mentionedProduct,
    hasDisclosure: decision.hasDisclosure,
    checkedAt: decision.policy.checkedAt,
    evidence: decision.policy.evidence,
  }
}
