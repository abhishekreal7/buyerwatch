import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { evaluateReplyQuality } from '@/lib/reply-quality'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { hasQStashConfiguration, publishQStashJson } from '@/lib/qstash'
import {
  boundedString,
  isTrustedSameOriginMutation,
  isUuid,
  readJsonBody,
  RequestInputError,
} from '@/lib/request'
import type { SendReplyData } from '@/lib/send-reply'
import { isRedditDirectPostingConfigured } from '@/lib/reddit-post'
import { recordEngagementEvent } from '@/lib/automation-audit'
import {
  evaluateRedditReplyPolicy,
  extractSubredditFromRedditUrl,
  getSubredditCommunityPolicy,
} from '@/lib/reddit-community-policy'
import { hasActiveRedditConnection } from '@/lib/reddit-session'
import { canMonitorPlatform } from '@/lib/plan-limits'

function safeRedditUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || !(hostname === 'reddit.com' || hostname.endsWith('.reddit.com'))) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

/**
 * A reviewed reply is either handed to QStash for confirmed provider delivery,
 * or returned as an explicit copy-and-open flow when Reddit API posting is not
 * available. The client must not treat a queued response as already posted.
 */
export async function POST(request: Request) {
  try {
    if (!isTrustedSameOriginMutation(request)) {
      return NextResponse.json({ error: 'untrusted_request_origin' }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await readJsonBody<Record<string, unknown>>(request)
    const threadId = body.threadId
    const text = boundedString(body.text, 10_000, { required: true })
    if (!isUuid(threadId) || text === null) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const rate = await actionRateLimit.limit(`reply-send:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const { data: thread } = await supabase
      .from('monitored_threads')
      .select('external_id, platform, status, url')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    if (thread.platform !== 'reddit' && thread.platform !== 'bluesky' && thread.platform !== 'x') {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 })
    }
    if (!['drafted', 'needs_manual_reply'].includes(thread.status)) {
      return NextResponse.json({ error: 'Thread is not sendable' }, { status: 409 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name, business_url, plan')
      .eq('id', user.id)
      .single()
    if (!profile?.business_name) {
      return NextResponse.json({ error: 'Profile is incomplete' }, { status: 409 })
    }
    if (!canMonitorPlatform(profile.plan, thread.platform)) {
      return NextResponse.json({ error: 'platform_requires_professional_plan' }, { status: 403 })
    }

    const quality = evaluateReplyQuality(text, {
      businessName: profile.business_name,
      platform: thread.platform,
    })
    if (quality.blocksAutomation) {
      return NextResponse.json({ error: 'reply_quality_check_failed', issues: quality.issues }, { status: 422 })
    }

    const admin = getServiceRoleClient()
    const { error: draftError } = await admin
      .from('reply_analytics')
      .update({ edited_text: text })
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
    if (draftError) {
      return NextResponse.json({ error: 'draft_persistence_failed' }, { status: 500 })
    }

    const { data: connection } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', thread.platform)
      .maybeSingle()
    const connectionActive = thread.platform === 'reddit'
      ? await hasActiveRedditConnection(user.id)
      : Boolean(connection)

    let requiresManualRedditSubmit = false
    let communityPolicy: Awaited<ReturnType<typeof getSubredditCommunityPolicy>> | null = null
    if (thread.platform === 'reddit') {
      const subreddit = extractSubredditFromRedditUrl(thread.url)
      communityPolicy = await getSubredditCommunityPolicy(user.id, subreddit ?? '')
      const policyDecision = evaluateRedditReplyPolicy(communityPolicy, {
        text,
        businessName: profile.business_name,
        businessUrl: profile.business_url,
      })
      if (policyDecision.outcome === 'blocked') {
        return NextResponse.json({
          error: policyDecision.reason,
          message: policyDecision.message,
          policy: communityPolicy,
        }, { status: 409 })
      }
      requiresManualRedditSubmit = policyDecision.outcome === 'manual_review_required'
    }

    if (thread.platform === 'reddit' && (
      !connection
      || !connectionActive
      || !isRedditDirectPostingConfigured()
      || requiresManualRedditSubmit
    )) {
      const postUrl = safeRedditUrl(thread.url)
      if (!postUrl) return NextResponse.json({ error: 'reddit_post_url_missing' }, { status: 409 })
      await recordEngagementEvent(admin, {
        userId: user.id,
        threadId,
        eventType: 'assisted_reply_prepared',
        platform: 'reddit',
        actorType: 'user',
        source: 'reviewed_reply',
        metadata: {
          deliveryMode: 'assisted',
          textLength: text.length,
          communityPolicy: communityPolicy ? {
            subreddit: communityPolicy.subreddit,
            status: communityPolicy.status,
            reasonCode: communityPolicy.reasonCode,
            checkedAt: communityPolicy.checkedAt,
          } : undefined,
        },
        idempotencyKey: `${threadId}:assisted-reply-prepared`,
      }).catch((auditError) => {
        console.error('[replies/send] Assisted handoff audit failed', auditError)
      })
      return NextResponse.json({
        success: true,
        mode: 'manual',
        threadId,
        postUrl,
        text,
        policy: communityPolicy,
      })
    }

    if (!connectionActive) {
      return NextResponse.json({ error: `${thread.platform}_connection_required` }, { status: 409 })
    }
    if (!hasQStashConfiguration()) {
      return NextResponse.json({ error: 'reply_delivery_unavailable' }, { status: 503 })
    }

    const message: SendReplyData = {
      userId: user.id,
      threadExternalId: thread.external_id,
      threadId,
      text,
      platform: thread.platform,
      triggerType: 'manual',
    }
    const messageId = await publishQStashJson('/api/jobs/send', message, {
      retries: 4,
      timeout: '4m',
    })
    if (!messageId) {
      return NextResponse.json({ error: 'reply_delivery_unavailable' }, { status: 503 })
    }

    return NextResponse.json({ success: true, mode: 'queued', threadId, messageId }, { status: 202 })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[replies/send] Failed to dispatch reply', error)
    return NextResponse.json({ error: 'send_dispatch_failed' }, { status: 500 })
  }
}
