import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIp, webhookRateLimit } from '@/lib/ratelimit'
import { readJsonBody, RequestInputError } from '@/lib/request'
import { recordEngagementEvent } from '@/lib/automation-audit'

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export async function POST(req: NextRequest) {
  try {
    const rate = await webhookRateLimit.limit(`conversion:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    const { shortcode, revenue_usd, replace = false } =
      await readJsonBody<Record<string, unknown>>(req, 2_048)
    if (
      !token
      || typeof shortcode !== 'string'
      || !/^[A-Za-z0-9_-]{4,64}$/.test(shortcode)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (
      revenue_usd !== undefined &&
      (
        typeof revenue_usd !== 'number'
        || !Number.isFinite(revenue_usd)
        || revenue_usd < 0
        || revenue_usd > 1_000_000_000
      )
    ) {
      return NextResponse.json({ error: 'invalid_revenue' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: attribution } = await supabase
      .from('reply_attribution')
      .select('id, user_id, thread_id, converted_at, revenue_usd')
      .eq('shortcode', shortcode)
      .maybeSingle()
    const { data: profile } = attribution
      ? await supabase.from('profiles').select('webhook_secret').eq('id', attribution.user_id).single()
      : { data: null }

    if (!attribution || !profile?.webhook_secret || !safeEqual(token, profile.webhook_secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let update = supabase
      .from('reply_attribution')
      .update({
        converted_at: new Date().toISOString(),
        revenue_usd: revenue_usd ?? attribution.revenue_usd ?? 0,
      })
      .eq('id', attribution.id)
    if (replace !== true) {
      update = update.is('converted_at', null)
    }
    const { data: updated, error } = await update.select('id').maybeSingle()
    if (error) {
      return NextResponse.json({ error: 'conversion_update_failed' }, { status: 500 })
    }
    if (!updated) {
      return NextResponse.json({ success: true, idempotent: true })
    }

    await recordEngagementEvent(supabase, {
      userId: attribution.user_id,
      threadId: attribution.thread_id,
      eventType: 'converted',
      actorType: 'provider',
      source: 'conversion_webhook',
      metadata: { revenueUsd: revenue_usd ?? attribution.revenue_usd ?? 0 },
      idempotencyKey: `${attribution.thread_id ?? attribution.id}:converted`,
    }).catch(() => undefined)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'conversion_processing_failed' }, { status: 500 })
  }
}
