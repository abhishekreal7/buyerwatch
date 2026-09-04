import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { draftReply } from '@/lib/draft-reply'
import { NormalizedPost } from '@/lib/types'
import { getPlanLimits } from '@/lib/plan-limits'
import { getEntitledPlan } from '@/lib/billing-entitlements'
import { buildAttributionShortUrl } from '@/lib/attribution'
import { ensureAttributionMapping } from '@/lib/attribution-store'
import { getAppUrl } from '@/lib/app-url'
import { getServiceRoleClient } from '@/lib/admin'
import {
  getAiErrorTelemetry,
  getAiUsageFromError,
  reserveAiSpend,
} from '@/lib/ai-usage'
import {
  releaseAiSpendDurably,
  releaseMonthlyDraftDurably,
  settleAiUsageDurably,
} from '@/lib/ai-settlement'
import { aiRateLimit, getIp } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, isUuid, readJsonBody, RequestInputError } from '@/lib/request'
import { recordEngagementEvent } from '@/lib/automation-audit'
import { BILLING_ADDONS } from '@/lib/billing-addons'
import { getConfiguredSecret, isDevelopmentMockEnabled } from '@/lib/env'
import { logger } from '@/lib/logger'

export async function POST(req: Request) {
  try {
    if (!isTrustedSameOriginMutation(req)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { threadId } = await readJsonBody<Record<string, unknown>>(req)
    if (!isUuid(threadId)) {
      return NextResponse.json({ error: 'Missing threadId' }, { status: 400 })
    }
    const rate = await aiRateLimit.limit(`reply-generate:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // 1. Fetch thread and user profile
    const { data: thread, error: threadError } = await supabase
      .from('monitored_threads')
      .select('id, external_id, platform, author, title, text_content, url, source_created_at, created_at, intent_score, tracking_sid, status, keywords(term, target)')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (threadError) throw threadError

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }
    if (!['pending', 'drafted', 'needs_manual_reply'].includes(thread.status)) {
      return NextResponse.json({ error: 'Thread is not draftable' }, { status: 409 })
    }
    if (
      !getConfiguredSecret(process.env.ANTHROPIC_API_KEY)
      && !isDevelopmentMockEnabled('USE_MOCK_DRAFTS')
    ) {
      return NextResponse.json(
        {
          error: 'ai_provider_unavailable',
          message: 'AI drafting is temporarily unavailable. You can write and send this reply manually.',
        },
        { status: 503 },
      )
    }

    const { data: extendedProfile } = await supabase
      .from('profiles')
      .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, tone_examples, plan, billing_status, billing_subscription_id, referral_tracking_enabled')
      .eq('id', user.id)
      .single()
    let profile = extendedProfile
    if (!profile) {
      const { data: legacyProfile } = await supabase
        .from('profiles')
        .select('business_name, business_description, business_url, business_type, writing_style, tone_examples, plan, billing_status, billing_subscription_id, referral_tracking_enabled')
        .eq('id', user.id)
        .single()
      profile = legacyProfile
        ? { ...legacyProfile, tone_archetype: null, style_guardrails: [] }
        : null
    }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const plan = getEntitledPlan(profile)
    const limits = getPlanLimits(plan)
    if (plan === 'free') {
      return NextResponse.json(
        {
          error: 'trial_required',
          message: 'Start your card-verified 7-day Starter trial to generate AI replies.',
        },
        { status: 403 },
      )
    }

    // 2. Map thread to NormalizedPost format for drafting.
    const post: NormalizedPost = {
      externalId: thread.external_id,
      platform: thread.platform,
      author: thread.author,
      title: thread.title || undefined,
      text: thread.text_content,
      url: thread.url,
      createdAt: thread.source_created_at || thread.created_at || new Date().toISOString(),
      sourceTarget: (thread.keywords as unknown as { target?: string } | null)?.target || '',
    }

    // 3. Set up attribution before reserving paid AI capacity.
    const admin = getServiceRoleClient()
    let trackingSid = thread.tracking_sid as string | null
    if (limits.replyAttribution && profile.referral_tracking_enabled !== false && profile.business_url && !trackingSid) {
      trackingSid = randomBytes(5).toString('base64url')
      const { error: trackingError } = await admin
        .from('monitored_threads')
        .update({ tracking_sid: trackingSid })
        .eq('id', threadId)
        .eq('user_id', user.id)
      if (trackingError) {
        return NextResponse.json({ error: 'tracking_setup_failed' }, { status: 500 })
      }
    }

    const trackingUrl = limits.replyAttribution
      && profile.referral_tracking_enabled !== false
      && profile.business_url
      && trackingSid
      ? buildAttributionShortUrl(getAppUrl(), trackingSid)
      : undefined
    if (trackingUrl && trackingSid) {
      await ensureAttributionMapping(getServiceRoleClient(), {
        userId: user.id,
        threadId,
        token: trackingSid,
        businessUrl: profile.business_url,
      })
    }
    // 4. Enforce both the plan allowance and provider-spend caps.
    const aiSpend = await reserveAiSpend(admin, {
      userId: user.id,
      purpose: 'draft',
      plan,
    })
    if (!aiSpend) {
      return NextResponse.json(
        { error: 'ai_spend_limit_reached' },
        { status: 429 },
      )
    }

    const { data: reserved, error: reserveError } = await admin.rpc(
      'reserve_monthly_draft',
      {
        p_user_id: user.id,
        p_limit: limits.aiDraftsPerMonth,
      },
    )
    if (reserveError) {
      await releaseAiSpendDurably(admin, {
        reservationId: aiSpend.id,
        userId: user.id,
      })
      return NextResponse.json({ error: 'draft_usage_check_failed' }, { status: 500 })
    }
    if (!reserved) {
      await releaseAiSpendDurably(admin, {
        reservationId: aiSpend.id,
        userId: user.id,
      })
      return NextResponse.json(
        {
          error: 'plan_limit_reached',
          limit: 'ai_drafts',
          addon: BILLING_ADDONS.drafts,
        },
        { status: 403 },
      )
    }

    let draftResult: Awaited<ReturnType<typeof draftReply>>
    try {
      draftResult = await draftReply(post, profile, thread.intent_score || 0, trackingUrl)
      try {
        await settleAiUsageDurably(admin, {
          reservationId: aiSpend.id,
          userId: user.id,
          usage: draftResult.usage,
        })
      } catch (usageError) {
        logger.error(
          { usageError, reservationId: aiSpend.id },
          'Failed to durably settle manual draft AI usage',
        )
      }
    } catch (draftError) {
      const failedUsage = getAiUsageFromError(draftError)
      try {
        if (
          failedUsage.inputTokens > 0
          || failedUsage.outputTokens > 0
          || failedUsage.estimatedCostMicrousd > 0
        ) {
          await settleAiUsageDurably(admin, {
            reservationId: aiSpend.id,
            userId: user.id,
            usage: failedUsage,
          })
        } else {
          await releaseAiSpendDurably(admin, {
            reservationId: aiSpend.id,
            userId: user.id,
          })
        }
      } catch (usageError) {
        logger.error(
          { usageError, reservationId: aiSpend.id },
          'Failed to durably settle failed manual draft usage',
        )
      }
      try {
        await releaseMonthlyDraftDurably(admin, {
          reservationId: aiSpend.id,
          userId: user.id,
        })
      } catch (releaseError) {
        logger.error(
          { releaseError, reservationId: aiSpend.id },
          'Failed to durably release manual draft allowance',
        )
      }
      throw draftError
    }
    
    // 5. Update thread status and save draft.
    const { error: saveError } = await supabase.rpc('save_generated_draft', {
      p_user_id: user.id,
      p_thread_id: threadId,
      p_draft_text: draftResult.text,
    })
    if (saveError) {
      try {
        await releaseMonthlyDraftDurably(admin, {
          reservationId: aiSpend.id,
          userId: user.id,
        })
      } catch (releaseError) {
        logger.error(
          { releaseError, reservationId: aiSpend.id },
          'Failed to durably release manual draft allowance after save failure',
        )
      }
      return NextResponse.json({ error: 'draft_save_failed' }, { status: 500 })
    }

    await recordEngagementEvent(admin, {
      userId: user.id,
      threadId,
      eventType: 'draft_generated',
      platform: thread.platform,
      actorType: 'system',
      source: 'manual_generation',
      metadata: {
        purpose: 'draft',
        textLength: draftResult.text.length,
      },
      idempotencyKey: `${threadId}:draft-generated:${aiSpend.id}`,
    }).catch((auditError) => {
      logger.error(
        { code: auditError instanceof Error ? auditError.name : 'unknown' },
        'Draft audit recording failed',
      )
    })

    return NextResponse.json({ success: true, draft: draftResult.text })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    logger.error(getAiErrorTelemetry(error), 'Draft generation request failed')
    return NextResponse.json(
      {
        error: 'draft_generation_failed',
        message: 'AI drafting is temporarily unavailable. You can write and send this reply manually.',
      },
      { status: 502 },
    )
  }
}
