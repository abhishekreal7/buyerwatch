import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    const { shortcode, revenue_usd, replace = false } = await req.json()
    if (!token || typeof shortcode !== 'string' || !shortcode) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (
      revenue_usd !== undefined &&
      (typeof revenue_usd !== 'number' || !Number.isFinite(revenue_usd) || revenue_usd < 0)
    ) {
      return NextResponse.json({ error: 'invalid_revenue' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: attribution } = await supabase
      .from('reply_attribution')
      .select('id, user_id, converted_at, revenue_usd')
      .eq('shortcode', shortcode)
      .maybeSingle()
    const { data: profile } = attribution
      ? await supabase.from('profiles').select('webhook_secret').eq('id', attribution.user_id).single()
      : { data: null }

    if (!attribution || !profile?.webhook_secret || !safeEqual(token, profile.webhook_secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (attribution.converted_at && replace !== true) {
      return NextResponse.json({ success: true, idempotent: true })
    }

    const { error } = await supabase
      .from('reply_attribution')
      .update({
        converted_at: new Date().toISOString(),
        revenue_usd: revenue_usd ?? attribution.revenue_usd ?? 0,
      })
      .eq('id', attribution.id)
    if (error) {
      return NextResponse.json({ error: 'conversion_update_failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'conversion_processing_failed' }, { status: 500 })
  }
}
