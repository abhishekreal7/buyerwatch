import { hasRedditPostingProvider } from './env'
import { AUTO_REPLY_MAX_AGE_MS, evaluateContentFreshness } from './content-freshness'
import {
  fetchRedditAccountProfile,
  fetchRedditPostSnapshot,
  postRedditApisComment,
  RedditApisRequestError,
} from './redditapis-client'
import { parseRedditPostTarget } from './redditapis-contract'
import {
  getActiveRedditSession,
  markRedditConnectionHealthy,
  markRedditConnectionReauthRequired,
  recordRedditConnectionFailure,
  RedditConnectionStateError,
  updateRedditConnectionAccountProfile,
} from './reddit-session'

export class PlatformPostError extends Error {
  public readonly deliveryUncertain: boolean
  public readonly reconnectRequired: boolean

  constructor(
    public readonly platform: string,
    public readonly responseBody: string,
    public readonly retryable: boolean,
    options: { deliveryUncertain?: boolean; reconnectRequired?: boolean } = {},
  ) {
    super(`Failed to post to ${platform}: ${responseBody}`)
    this.name = 'PlatformPostError'
    this.deliveryUncertain = options.deliveryUncertain === true
    this.reconnectRequired = options.reconnectRequired === true
  }
}

export function isRedditDirectPostingConfigured(): boolean {
  return hasRedditPostingProvider()
}

function normalizeExternalPostId(value: string): string | null {
  const normalized = value.trim().replace(/^t3_/i, '').toLowerCase()
  return /^[a-z0-9]{5,12}$/i.test(normalized) ? normalized : null
}

function connectionError(error: RedditConnectionStateError): PlatformPostError {
  return new PlatformPostError('reddit', error.code, false, {
    reconnectRequired: error.code === 'reddit_reconnect_required',
  })
}

function providerError(error: RedditApisRequestError): PlatformPostError {
  return new PlatformPostError('reddit', error.code, error.retryable, {
    deliveryUncertain: error.deliveryUncertain,
    reconnectRequired: error.reauthRequired,
  })
}

function boundedIntegerEnvironment(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name])
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

export async function postRedditReply(input: {
  userId: string
  threadExternalId: string
  postUrl: string
  text: string
  triggerType: 'manual' | 'auto'
}) {
  if (!isRedditDirectPostingConfigured()) {
    throw new PlatformPostError('reddit', 'reddit_direct_posting_unavailable', false)
  }

  const target = parseRedditPostTarget(input.postUrl)
  const expectedPostId = normalizeExternalPostId(input.threadExternalId)
  if (!target || !expectedPostId || target.postId !== expectedPostId) {
    throw new PlatformPostError('reddit', 'reddit_post_identity_mismatch', false)
  }

  let session: Awaited<ReturnType<typeof getActiveRedditSession>>
  try {
    session = await getActiveRedditSession(input.userId)
  } catch (error) {
    if (error instanceof RedditConnectionStateError) throw connectionError(error)
    throw error
  }

  if (input.triggerType === 'auto') {
    const minimumAgeDays = boundedIntegerEnvironment('REDDIT_AUTO_MIN_ACCOUNT_AGE_DAYS', 30, 7, 365)
    const minimumKarma = boundedIntegerEnvironment('REDDIT_AUTO_MIN_COMBINED_KARMA', 50, 0, 100_000)
    let safetyProfile = {
      accountCreatedAt: session.accountCreatedAt,
      linkKarma: session.linkKarma,
      commentKarma: session.commentKarma,
    }
    if (
      !safetyProfile.accountCreatedAt
      || safetyProfile.linkKarma === null
      || safetyProfile.commentKarma === null
    ) {
      try {
        const refreshed = await fetchRedditAccountProfile(session.username)
        safetyProfile = {
          accountCreatedAt: refreshed.createdAt,
          linkKarma: refreshed.linkKarma,
          commentKarma: refreshed.commentKarma,
        }
        await updateRedditConnectionAccountProfile(input.userId, safetyProfile)
      } catch {
        throw new PlatformPostError('reddit', 'reddit_account_safety_profile_unavailable', false)
      }
    }

    const accountCreatedAt = Date.parse(safetyProfile.accountCreatedAt ?? '')
    if (!Number.isFinite(accountCreatedAt)) {
      throw new PlatformPostError('reddit', 'reddit_account_age_unverified', false)
    }
    if (Date.now() - accountCreatedAt < minimumAgeDays * 24 * 60 * 60_000) {
      throw new PlatformPostError('reddit', 'reddit_account_too_new_for_automation', false)
    }
    const combinedKarma = (safetyProfile.linkKarma ?? 0) + (safetyProfile.commentKarma ?? 0)
    if (safetyProfile.linkKarma === null || safetyProfile.commentKarma === null || combinedKarma < minimumKarma) {
      throw new PlatformPostError('reddit', 'reddit_account_karma_below_automation_minimum', false)
    }
  }

  let post: Awaited<ReturnType<typeof fetchRedditPostSnapshot>>
  try {
    post = await fetchRedditPostSnapshot(target.canonicalUrl)
  } catch (error) {
    if (error instanceof RedditApisRequestError) throw providerError(error)
    throw error
  }

  if (post.id !== expectedPostId || post.subreddit.toLowerCase() !== target.subreddit.toLowerCase()) {
    throw new PlatformPostError('reddit', 'reddit_post_identity_mismatch', false)
  }
  if (post.locked) {
    throw new PlatformPostError('reddit', 'reddit_post_locked', false)
  }
  if (post.author.toLowerCase() === session.username.toLowerCase()) {
    throw new PlatformPostError('reddit', 'reddit_self_reply_blocked', false)
  }
  if (post.author === '[deleted]' || post.author.toLowerCase() === 'automoderator') {
    throw new PlatformPostError('reddit', 'reddit_non_actionable_author', false)
  }
  if (input.triggerType === 'auto' && post.stickied) {
    throw new PlatformPostError('reddit', 'reddit_stickied_post_requires_review', false)
  }
  if (input.triggerType === 'auto' && post.over18) {
    throw new PlatformPostError('reddit', 'reddit_nsfw_post_requires_review', false)
  }
  if (input.triggerType === 'auto') {
    const freshness = evaluateContentFreshness(post.createdAt, {
      maxAgeMs: AUTO_REPLY_MAX_AGE_MS,
    })
    if (freshness.fresh === false) {
      throw new PlatformPostError(
        'reddit',
        freshness.reason === 'source_too_old'
          ? 'reddit_post_outside_reply_window'
          : 'reddit_post_age_unverified',
        false,
      )
    }
  }

  try {
    const result = await postRedditApisComment({
      postUrl: target.canonicalUrl,
      text: input.text,
      cookies: session.cookies,
    })
    await markRedditConnectionHealthy(input.userId)
    return { permalink: result.permalink }
  } catch (error) {
    if (!(error instanceof RedditApisRequestError)) throw error
    if (error.reauthRequired) {
      await markRedditConnectionReauthRequired(input.userId, error.code).catch(() => undefined)
    } else {
      await recordRedditConnectionFailure(input.userId, error.code).catch(() => undefined)
    }
    throw providerError(error)
  }
}
