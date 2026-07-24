import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BOT_REGEX = /bot|crawler|spider|facebookexternalhit|redditbot|slackbot|meta-externalagent|twitterbot|discordbot|curl|wget/i

// Feature 6.1: In-memory sliding window dedup map (shortcode:ip -> timestamp)
const recentClicksMap = new Map<string, number>()
const DEDUP_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

function isDuplicateClick(shortcode: string, ip: string): boolean {
  const key = `${shortcode}:${ip}`
  const now = Date.now()
  const lastClick = recentClicksMap.get(key)
  if (lastClick && now - lastClick < DEDUP_WINDOW_MS) {
    return true
  }
  recentClicksMap.set(key, now)
  // Prune map if large
  if (recentClicksMap.size > 10000) {
    for (const [k, time] of recentClicksMap.entries()) {
      if (now - time > DEDUP_WINDOW_MS) recentClicksMap.delete(k)
    }
  }
  return false
}

/**
 * GET /r/[shortcode]
 *
 * Feature 2: Branded Shortlink Redirect Route
 *
 * Security & Reliability Fixes Applied:
 * - Fix 4.2: Non-blocking redirect — DB click logging is fire-and-forget.
 * - Fix 5.3: Server-controlled destination_url strictly read from DB (no query param override accepted).
 * - Fix 6.1: Bot User-Agent filtering & 10-minute IP click deduplication.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ shortcode: string }> }
) {
  const { shortcode } = await context.params
  const fallbackUrl = 'https://scouto.io'

  if (!shortcode) {
    return NextResponse.redirect(fallbackUrl, { status: 302 })
  }

  const userAgent = req.headers.get('user-agent') || ''
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1'
  const isBot = BOT_REGEX.test(userAgent)
  const isDupe = isDuplicateClick(shortcode, ip)

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fix 5.3: Destination URL is strictly fetched from database row created at reply-drafting time
    const { data } = await supabase
      .from('reply_attribution')
      .select('destination_url, clicked_at')
      .eq('shortcode', shortcode)
      .single()

    const destination = data?.destination_url || fallbackUrl

    // Fix 4.2 & 6.1: Asynchronously log click ONLY if human and non-duplicate, fire-and-forget
    if (data && !isBot && !isDupe && !data.clicked_at) {
      supabase
        .from('reply_attribution')
        .update({ clicked_at: new Date().toISOString() })
        .eq('shortcode', shortcode)
        .then()
    }

    // Always 302 redirect instantly
    return NextResponse.redirect(destination, { status: 302 })
  } catch {
    return NextResponse.redirect(fallbackUrl, { status: 302 })
  }
}
