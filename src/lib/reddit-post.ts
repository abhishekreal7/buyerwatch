import { getRedditPostingProviderKind, hasRedditPostingProvider } from './env'
import { AUTO_REPLY_MAX_AGE_MS, evaluateContentFreshness } from './content-freshness'
import {
  fetchRedditAccountProfile,
  fetchRedditPostSnapshot,
  postRedditApisComment,
  RedditApisRequestError,
} from './redditapis-client'
import { parseRedditPostTarget } from './redditapis-contract'
import {
  fetchHyperbrowserRedditAccountProfile,
  postHyperbrowserRedditReply,
  type HyperbrowserRedditError,
} from './hyperbrowser-reddit'
import {
  getActiveRedditSession,
  markRedditConnectionHealthy,
  markRedditConnectionReauthRequired,
  recordRedditConnectionFailure,
  RedditConnectionStateError,
  updateRedditConnectionAccountProfile,
} from './reddit-session'
import {
  fetchSprinklrRedditPostSnapshot,
  postSprinklrRedditReply,
  SprinklrRequestError,
} from './sprinklr-client'
import { alertRedditDeliveryFailure } from './reddit-delivery-alerts'
import {
  assertRedditDeliveryCircuitClosed,
  RedditDeliveryCircuitOpenError,
} from './reddit-service-safety'

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

function sprinklrProviderError(error: SprinklrRequestError): PlatformPostError {
  return new PlatformPostError('reddit', error.code, error.retryable, {
    deliveryUncertain: error.deliveryUncertain,
  })
}

function hyperbrowserProviderError(error: HyperbrowserRedditError): PlatformPostError {
  return new PlatformPostError('reddit', error.code, error.retryable, {
    deliveryUncertain: error.deliveryUncertain,
    reconnectRequired: error.reauthRequired,
  })
}

function isHyperbrowserProviderError(error: unknown): error is HyperbrowserRedditError {
  if (!(error instanceof Error) || error.name !== 'HyperbrowserRedditError') return false
  const candidate = error as Partial<HyperbrowserRedditError>
  return typeof candidate.code === 'string'
    && typeof candidate.retryable === 'boolean'
    && typeof candidate.deliveryUncertain === 'boolean'
    && typeof candidate.reauthRequired === 'boolean'
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
  const postingProvider = getRedditPostingProviderKind()
  if (!postingProvider) {
    throw new PlatformPostError('reddit', 'reddit_direct_posting_unavailable', false)
  }

  try {
    await assertRedditDeliveryCircuitClosed()
  } catch (error) {
    if (error instanceof RedditDeliveryCircuitOpenError) {
      throw new PlatformPostError('reddit', error.code, false)
    }
    throw error
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
  if (session.provider !== postingProvider) {
    throw new PlatformPostError('reddit', 'reddit_reconnect_required', false, {
      reconnectRequired: true,
    })
  }

  if (
    input.triggerType === 'auto'
    && (session.provider === 'redditapis' || session.provider === 'hyperbrowser')
  ) {
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
        const refreshed = session.provider === 'hyperbrowser'
          ? await fetchHyperbrowserRedditAccountProfile({
              username: session.username,
              profileId: session.profileId,
            })
          : await fetchRedditAccountProfile(session.username)
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

  // A persisted Hyperbrowser profile must not be opened in two immediate,
  // separate sessions for the same delivery. Reddit can rotate auth cookies
  // during the inspection session and Hyperbrowser persistence is eventually
  // consistent, making the following write session appear logged out. The
  // provider validates the exact post and all delivery safety gates before it
  // clicks, so inspection and posting stay atomic in one browser session.
  if (session.provider === 'hyperbrowser') {
    try {
      const result = await postHyperbrowserRedditReply({
        postUrl: target.canonicalUrl,
        text: input.text,
        username: session.username,
        profileId: session.profileId,
        triggerType: input.triggerType,
      })
      await markRedditConnectionHealthy(input.userId)
      return { permalink: result.permalink }
    } catch (error) {
      if (isHyperbrowserProviderError(error)) {
        let consecutiveFailures = 0
        if (error.reauthRequired) {
          await markRedditConnectionReauthRequired(input.userId, error.code).catch(() => undefined)
        } else {
          consecutiveFailures = await recordRedditConnectionFailure(input.userId, error.code)
            .catch(() => 0)
        }
        await alertRedditDeliveryFailure({
          userId: input.userId,
          code: error.code,
          reauthRequired: error.reauthRequired,
          deliveryUncertain: error.deliveryUncertain,
          consecutiveFailures,
        }).catch(() => undefined)
        throw hyperbrowserProviderError(error)
      }
      throw error
    }
  }

  let post: Awaited<ReturnType<typeof fetchRedditPostSnapshot>>
    | Awaited<ReturnType<typeof fetchSprinklrRedditPostSnapshot>>
  try {
    if (session.provider === 'sprinklr') {
      post = await fetchSprinklrRedditPostSnapshot(target.canonicalUrl)
    } else {
      post = await fetchRedditPostSnapshot(target.canonicalUrl)
    }
  } catch (error) {
    if (error instanceof RedditApisRequestError) throw providerError(error)
    if (error instanceof SprinklrRequestError) throw sprinklrProviderError(error)
    if (isHyperbrowserProviderError(error)) {
      if (error.reauthRequired) {
        await markRedditConnectionReauthRequired(input.userId, error.code).catch(() => undefined)
      } else {
        await recordRedditConnectionFailure(input.userId, error.code).catch(() => undefined)
      }
      throw hyperbrowserProviderError(error)
    }
    throw error
  }

  if (post.id !== expectedPostId || post.subreddit.toLowerCase() !== target.subreddit.toLowerCase()) {
    throw new PlatformPostError('reddit', 'reddit_post_identity_mismatch', false)
  }
  if (post.locked === true) {
    throw new PlatformPostError('reddit', 'reddit_post_locked', false)
  }
  if (!post.author) {
    throw new PlatformPostError('reddit', 'reddit_post_author_unverified', false)
  }
  if (post.author.toLowerCase() === session.username.toLowerCase()) {
    throw new PlatformPostError('reddit', 'reddit_self_reply_blocked', false)
  }
  if (post.author === '[deleted]' || post.author.toLowerCase() === 'automoderator') {
    throw new PlatformPostError('reddit', 'reddit_non_actionable_author', false)
  }
  if (
    input.triggerType === 'auto'
    && (post.locked === null || post.stickied === null || post.over18 === null)
  ) {
    throw new PlatformPostError('reddit', 'reddit_post_moderation_state_unverified', false)
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
    const result = session.provider === 'sprinklr'
      ? await postSprinklrRedditReply({
          postUrl: target.canonicalUrl,
          text: input.text,
          accountId: session.accountId,
          channelId: session.channelId,
        })
      : await postRedditApisComment({
          postUrl: target.canonicalUrl,
          text: input.text,
          cookies: session.cookies,
        })
    await markRedditConnectionHealthy(input.userId)
    return { permalink: result.permalink }
  } catch (error) {
    if (error instanceof RedditApisRequestError) {
      if (error.reauthRequired) {
        await markRedditConnectionReauthRequired(input.userId, error.code).catch(() => undefined)
      } else {
        await recordRedditConnectionFailure(input.userId, error.code).catch(() => undefined)
      }
      throw providerError(error)
    }
    if (error instanceof SprinklrRequestError) {
      await recordRedditConnectionFailure(input.userId, error.code).catch(() => undefined)
      throw sprinklrProviderError(error)
    }
    if (isHyperbrowserProviderError(error)) {
      if (error.reauthRequired) {
        await markRedditConnectionReauthRequired(input.userId, error.code).catch(() => undefined)
      } else {
        await recordRedditConnectionFailure(input.userId, error.code).catch(() => undefined)
      }
      throw hyperbrowserProviderError(error)
    }
    throw error
  }
}
