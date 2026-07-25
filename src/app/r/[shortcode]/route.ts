import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { redis } from '@/lib/redis'
import { getSafeHttpUrl } from '@/lib/security/outbound-url'

const BOT_REGEX = /bot|crawler|spider|facebookexternalhit|redditbot|slackbot|meta-externalagent|twitterbot|discordbot|curl|wget/i

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await context.params
  const fallbackUrl = new URL('/', req.nextUrl.origin)
  if (!shortcode) return NextResponse.redirect(fallbackUrl, { status: 302 })

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data, error } = await supabase
      .from('reply_attribution')
      .select('destination_url, clicked_at')
      .eq('shortcode', shortcode)
      .maybeSingle()

    const destination = data?.destination_url ? getSafeHttpUrl(data.destination_url) : null
    if (error || !destination) {
      return NextResponse.redirect(fallbackUrl, { status: 302 })
    }

    const userAgent = req.headers.get('user-agent') ?? ''
    const sourceIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const visitorHash = createHash('sha256').update(sourceIp).digest('hex').slice(0, 24)
    const dedupKey = `click:${shortcode}:${visitorHash}`
    const firstRecentClick = await redis.set(dedupKey, '1', 'EX', 600, 'NX')

    if (!BOT_REGEX.test(userAgent) && firstRecentClick && !data?.clicked_at) {
      await supabase
        .from('reply_attribution')
        .update({ clicked_at: new Date().toISOString() })
        .eq('shortcode', shortcode)
        .is('clicked_at', null)
    }

    return NextResponse.redirect(destination, { status: 302 })
  } catch {
    return NextResponse.redirect(fallbackUrl, { status: 302 })
  }
}
