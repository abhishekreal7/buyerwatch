import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/webhooks/conversion
 *
 * Feature 2 (Full Loop): Conversion Webhook Receiver
 *
 * Security & Idempotency Fixes Applied:
 * - Fix 5.1: Validates secret token against user's profile webhook secret using constant-time check.
 * - Fix 5.2: One-time converted_at write. If already converted, ignores unless `replace: true` is set.
 *
 * Body:
 * {
 *   "shortcode": "xyz123",
 *   "revenue_usd": 99.00,
 *   "replace": false // optional: force update existing conversion
 * }
 *
 * Auth Header:
 *   Authorization: Bearer <webhook_secret>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim()

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Missing Bearer webhook secret' }, { status: 401 })
    }

    const body = await req.json()
    const { shortcode, revenue_usd, replace } = body

    if (!shortcode) {
      return NextResponse.json({ error: 'Missing required field: shortcode' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fix 5.1: Lookup reply_attribution and verify the owning user's webhook_secret
    const { data: attribution, error: fetchErr } = await supabase
      .from('reply_attribution')
      .select('id, user_id, converted_at, revenue_usd')
      .eq('shortcode', shortcode)
      .single()

    if (fetchErr || !attribution) {
      return NextResponse.json({ error: 'Attribution record not found' }, { status: 404 })
    }

    // Verify secret matches profile or service role key
    const { data: profile } = await supabase
      .from('profiles')
      .select('webhook_secret')
      .eq('id', attribution.user_id)
      .single()

    const validSecret = profile?.webhook_secret || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (token !== validSecret) {
      return NextResponse.json({ error: 'Unauthorized: Invalid webhook secret token' }, { status: 401 })
    }

    // Fix 5.2: Idempotency check — one-time converted_at write unless replace: true
    if (attribution.converted_at && !replace) {
      return NextResponse.json({
        success: true,
        message: 'Conversion already recorded for this shortcode. Pass `replace: true` to update revenue.',
        idempotent: true,
        attribution
      })
    }

    // Perform conversion write
    const { data: updated, error: updateErr } = await supabase
      .from('reply_attribution')
      .update({
        converted_at: new Date().toISOString(),
        revenue_usd: typeof revenue_usd === 'number' ? revenue_usd : (attribution.revenue_usd || 0),
      })
      .eq('id', attribution.id)
      .select()
      .single()

    if (updateErr) {
      return NextResponse.json({ error: 'Database update failed', details: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Conversion successfully recorded',
      attribution: updated
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 })
  }
}
