import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { encrypt } from '@/lib/encryption'
import { BskyAgent } from '@atproto/api'
import { createTimeoutFetch } from '@/lib/http'
import { getServiceRoleClient } from '@/lib/admin'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { boundedString, readJsonBody, RequestInputError } from '@/lib/request'

export async function POST(req: Request) {
  try {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJsonBody<Record<string, unknown>>(req, 4_096)
  const handle = boundedString(body.handle, 253, { required: true })
  const password = boundedString(body.password, 1_000, { required: true })
  if (!handle || !password) return NextResponse.json({ error: 'Missing handle or password' }, { status: 400 })
  const rate = await settingsRateLimit.limit(`bluesky-connect:${user.id}:${await getIp()}`)
  if (!rate.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  // Verify the credentials work before saving
  const agent = new BskyAgent({
    service: 'https://bsky.social',
    fetch: createTimeoutFetch(15_000),
  })
  try {
    await agent.login({ identifier: handle, password })
  } catch {
    return NextResponse.json({ error: 'Invalid Bluesky credentials' }, { status: 401 })
  }

  // Save to DB
  const { error } = await getServiceRoleClient().from('platform_connections').upsert({
    user_id: user.id,
    platform: 'bluesky',
    access_token: encrypt(password), // Store App Password encrypted in access_token column
    external_username: handle,
    connected_at: new Date().toISOString()
  }, { onConflict: 'user_id, platform' })
  if (error) {
    return NextResponse.json({ error: 'connection_save_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'connection_failed' }, { status: 500 })
  }
}
