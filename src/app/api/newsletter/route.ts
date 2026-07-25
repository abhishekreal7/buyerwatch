import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { actionRateLimit, getIp } from '@/lib/ratelimit'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const ip = await getIp()
  const { success } = await actionRateLimit.limit(`newsletter:${ip}`)
  if (!success) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
  }

  let body: { email?: unknown; website?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  // Honeypot submissions receive the normal success response without a write.
  if (typeof body.website === 'string' && body.website.trim()) {
    return NextResponse.json({ success: true })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await admin
    .from('newsletter_subscribers')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })

  if (error) {
    return NextResponse.json({ error: 'subscription_failed' }, { status: 500 })
  }
  return NextResponse.json({ success: true }, { status: 201 })
}
