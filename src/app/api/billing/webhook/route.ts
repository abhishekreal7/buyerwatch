import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * POST /api/billing/webhook
 *
 * Receives LemonSqueezy subscription lifecycle events and updates the user's
 * plan + keyword rule state accordingly.
 *
 * Events handled:
 *   subscription_created   → activate plan (pro | growth)
 *   subscription_updated   → handle plan change / renewal
 *   subscription_cancelled → downgrade to free, pause excess keyword rules
 *   subscription_expired   → same as cancelled
 *
 * Downgrade contract (enforced here, displayed in keywords/page.tsx):
 *   - Do NOT delete any keyword rules, thread history, or draft history
 *   - Keep the most-recently-active keyword active (by updated_at, then created_at)
 *   - Set all other rules is_active = false
 *   - User sees a persistent banner to upgrade and reactivate
 *
 * TODO: set LEMON_SQUEEZY_WEBHOOK_SECRET in .env.local after configuring the
 * webhook endpoint in LemonSqueezy dashboard → Settings → Webhooks.
 */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET
  if (!secret) {
    // FAIL CLOSED: no secret configured → reject all requests.
    // Never silently accept unverified webhooks — an unsecured endpoint can be
    // used to fake plan upgrades. Set LEMON_SQUEEZY_WEBHOOK_SECRET before going live.
    console.error('[billing/webhook] LEMON_SQUEEZY_WEBHOOK_SECRET is not set — rejecting all requests')
    return false
  }
  if (!signature) return false
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  try {
    // timingSafeEqual throws if buffers have different byte lengths.
    // An attacker could send a malformed x-signature header to trigger this.
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/**
 * Enforce keyword rules after a downgrade to free.
 * Keeps the most-recently-active keyword active, pauses all others.
 * Never deletes data.
 */
async function enforceDowngradeKeywordLimit(userId: string, supabase: ReturnType<typeof getSupabase>) {
  const { data: keywords, error } = await supabase
    .from('keywords')
    .select('id, is_active, updated_at, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false, nullsFirst: false })

  if (error || !keywords || keywords.length <= 1) return

  // Most recently updated keyword stays active (already first due to order)
  const [keepActive, ...toDeactivate] = keywords

  if (toDeactivate.length === 0) return

  await supabase
    .from('keywords')
    .update({ is_active: false })
    .in('id', toDeactivate.map((k) => k.id))
    .eq('user_id', userId)

  // Ensure the keepActive rule is actually active (it might have been paused)
  await supabase
    .from('keywords')
    .update({ is_active: true })
    .eq('id', keepActive.id)
    .eq('user_id', userId)

  console.info(`[billing/webhook] Downgrade: kept rule ${keepActive.id} active, paused ${toDeactivate.length} rules for user ${userId}`)
}

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('x-signature')

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: { meta: { event_name: string; custom_data?: { user_id?: string } }; data: { attributes: Record<string, unknown> } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventName = event.meta?.event_name
  const userId = event.meta?.custom_data?.user_id

  if (!userId) {
    console.warn(`[billing/webhook] No user_id in custom_data for event ${eventName}`)
    return NextResponse.json({ received: true })
  }

  const supabase = getSupabase()
  const attrs = event.data?.attributes || {}

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated': {
      // Map LemonSqueezy product/variant to Scouto plan tier
      // TODO: replace variant IDs below with real values from LemonSqueezy dashboard
      const variantId = attrs.variant_id as number | undefined
      const PRO_VARIANT_ID = Number(process.env.LEMON_SQUEEZY_PRO_VARIANT_ID ?? 0)
      const GROWTH_VARIANT_ID = Number(process.env.LEMON_SQUEEZY_GROWTH_VARIANT_ID ?? 0)

      let newPlan = 'free'
      if (variantId && variantId === PRO_VARIANT_ID) newPlan = 'pro'
      else if (variantId && variantId === GROWTH_VARIANT_ID) newPlan = 'growth'

      if (newPlan !== 'free') {
        const { error } = await supabase
          .from('profiles')
          .update({ plan: newPlan })
          .eq('id', userId)

        if (error) {
          console.error(`[billing/webhook] Failed to update plan for ${userId}:`, error)
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
        }
        console.info(`[billing/webhook] ${eventName}: set plan=${newPlan} for user ${userId}`)
      }
      break
    }

    case 'subscription_cancelled':
    case 'subscription_expired': {
      // Downgrade to free: update plan, then enforce keyword limit
      const { error } = await supabase
        .from('profiles')
        .update({ plan: 'free', auto_send_enabled: false })
        .eq('id', userId)

      if (error) {
        console.error(`[billing/webhook] Failed to downgrade plan for ${userId}:`, error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }

      await enforceDowngradeKeywordLimit(userId, supabase)
      console.info(`[billing/webhook] ${eventName}: downgraded user ${userId} to free`)
      break
    }

    default:
      // Other events (invoices, order created, etc.) — acknowledge without action
      break
  }

  return NextResponse.json({ received: true })
}
