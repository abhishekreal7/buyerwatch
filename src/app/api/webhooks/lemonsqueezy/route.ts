import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    // 1. Get the raw body for signature verification
    const rawBody = await req.text()
    
    // 2. Verify signature
    const signature = req.headers.get('x-signature')
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET
    
    if (!signature || !secret) {
      return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 })
    }

    const hmac = crypto.createHmac('sha256', secret)
    const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8')
    const signatureBuffer = Buffer.from(signature, 'utf8')

    if (digest.length !== signatureBuffer.length || !crypto.timingSafeEqual(digest, signatureBuffer)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }

    // 3. Parse payload
    const payload = JSON.parse(rawBody)
    const eventName = payload.meta.event_name
    const obj = payload.data.attributes
    const customData = payload.meta.custom_data || {}
    const userId = customData.user_id

    if (!userId) {
      // If there's no user_id, we can't associate it. 
      // In a real scenario, you might fall back to looking up by customer_email.
      console.warn(`Webhook missing custom_data.user_id: ${eventName}`)
      return NextResponse.json({ message: 'Missing user_id, skipped' })
    }

    // 4. Handle specific events idempotently
    switch (eventName) {
      case 'subscription_created':
      case 'subscription_updated': {
        // Find which plan this variant corresponds to
        // For production, you map variant_id to 'pro' or 'business'
        // We'll assume a basic mapping or default to 'pro' if unknown
        const planName = 'pro'
        
        await supabase
          .from('profiles')
          .update({ plan: planName })
          .eq('id', userId)
        break
      }
      case 'subscription_cancelled':
      case 'subscription_expired':
      case 'subscription_payment_failed': {
        // Downgrade to free
        await supabase
          .from('profiles')
          .update({ plan: 'free' })
          .eq('id', userId)
        break
      }
      default:
        // Ignore other events
        break
    }

    return NextResponse.json({ message: 'OK' })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
