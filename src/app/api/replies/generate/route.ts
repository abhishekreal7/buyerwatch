import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { draftReply } from '@/lib/draft-reply'
import { NormalizedPost } from '@/lib/types'
import { getPlanLimits, normalizePlan } from '@/lib/plan-limits'
import { buildAttributionShortUrl } from '@/lib/attribution'
import { ensureAttributionMapping } from '@/lib/attribution-store'
import { getAppUrl } from '@/lib/app-url'
import { getServiceRoleClient } from '@/lib/admin'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { threadId } = await req.json()
    if (!threadId) {
      return NextResponse.json({ error: 'Missing threadId' }, { status: 400 })
    }

    // 1. Fetch thread and user profile
    const { data: thread } = await supabase
      .from('monitored_threads')
      .select('id, external_id, platform, author, title, text_content, url, created_at, intent_score, tracking_sid, keywords(term, target)')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, tone_examples, plan, referral_tracking_enabled')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // 2. Enforce monthly AI draft limit
    const plan = normalizePlan(profile.plan)
    const limits = getPlanLimits(plan)
    const { data: reserved, error: reserveError } = await supabase.rpc('reserve_monthly_draft', {
      p_user_id: user.id,
      p_limit: limits.aiDraftsPerMonth,
    })

    if (reserveError) {
      return NextResponse.json({ error: 'draft_usage_check_failed' }, { status: 500 })
    }
    if (!reserved) {
      return NextResponse.json(
        { error: 'plan_limit_reached', limit: 'ai_drafts' },
        { status: 403 }
      )
    }

    // 3. Map thread to NormalizedPost format for drafting
    const post: NormalizedPost = {
      externalId: thread.external_id,
      platform: thread.platform,
      author: thread.author,
      title: thread.title || undefined,
      text: thread.text_content,
      url: thread.url,
      createdAt: thread.created_at || new Date().toISOString(),
      sourceTarget: (thread.keywords as unknown as { target?: string } | null)?.target || '',
    }

    // 4. Draft reply
    let trackingSid = thread.tracking_sid as string | null
    if (profile.referral_tracking_enabled !== false && profile.business_url && !trackingSid) {
      trackingSid = randomBytes(5).toString('base64url')
      const { error: trackingError } = await supabase
        .from('monitored_threads')
        .update({ tracking_sid: trackingSid })
        .eq('id', threadId)
        .eq('user_id', user.id)
      if (trackingError) {
        return NextResponse.json({ error: 'tracking_setup_failed' }, { status: 500 })
      }
    }

    const trackingUrl = profile.referral_tracking_enabled !== false
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
    const draftResult = await draftReply(post, profile, thread.intent_score || 0, trackingUrl)
    
    // 5. Update thread status and save draft
    const { error: saveError } = await supabase.rpc('save_generated_draft', {
      p_user_id: user.id,
      p_thread_id: threadId,
      p_draft_text: draftResult.text,
    })
    if (saveError) {
      return NextResponse.json({ error: 'draft_save_failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, draft: draftResult.text })
  } catch (error) {
    console.error('Error generating draft:', error)
    return NextResponse.json({ error: 'draft_generation_failed' }, { status: 502 })
  }
}
