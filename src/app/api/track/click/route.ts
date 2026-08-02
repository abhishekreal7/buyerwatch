import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSafeHttpUrl } from '@/lib/security/outbound-url'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { recordEngagementEvent } from '@/lib/automation-audit'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const fallback = new URL('/', req.nextUrl.origin)
  if (!token || !/^[A-Za-z0-9_-]{4,128}$/.test(token)) {
    return NextResponse.redirect(fallback, { status: 302 })
  }

  try {
    const rate = await actionRateLimit.limit(`track-click:${await getIp()}`)
    if (!rate.success) return NextResponse.redirect(fallback, { status: 302 })
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data, error } = await supabase
      .from('reply_attribution')
      .select('destination_url, clicked_at, user_id, thread_id')
      .eq('attribution_token', token)
      .maybeSingle()

    const destination = data?.destination_url ? getSafeHttpUrl(data.destination_url) : null
    if (error || !destination) {
      return NextResponse.redirect(fallback, { status: 302 })
    }
    const attribution = data!

    if (!data?.clicked_at) {
      const { data: updated } = await supabase
        .from('reply_attribution')
        .update({ clicked_at: new Date().toISOString() })
        .eq('attribution_token', token)
        .is('clicked_at', null)
        .select('id')
        .maybeSingle()
      if (updated && attribution.user_id) {
        await recordEngagementEvent(supabase, {
          userId: attribution.user_id,
          threadId: attribution.thread_id,
          eventType: 'clicked',
          actorType: 'user',
          source: 'tracked_redirect',
          metadata: { token },
          idempotencyKey: `${attribution.thread_id ?? token}:clicked`,
        }).catch(() => undefined)
      }
    }

    return NextResponse.redirect(destination, { status: 302 })
  } catch {
    return NextResponse.redirect(fallback, { status: 302 })
  }
}
