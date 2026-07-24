import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/track/click?token=<attribution_token>&redirect=<url>
 *
 * Feature 2: Attribution Pixel — Reply → Click tracking
 *
 * Flow:
 *   1. Scouto appends ?ref=scouto&token=<token> to the product URL in the reply
 *   2. When someone clicks through to the product, they hit this endpoint first
 *   3. We record clicked_at on the reply_attribution row
 *   4. We 302-redirect them to the actual destination
 *
 * This endpoint must be public (no auth) since we have no session for the clicker.
 * The token is a short random string that maps to a thread_id.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const redirectTo = req.nextUrl.searchParams.get('redirect')

  // Always redirect — never expose an error page to an end user clicking a link
  const fallbackRedirect = redirectTo || '/'

  if (!token) {
    return NextResponse.redirect(fallbackRedirect, { status: 302 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // service role so no RLS blocks
    )

    // Mark the click — ignore error (best-effort tracking, don't block redirect)
    await supabase
      .from('reply_attribution')
      .update({ clicked_at: new Date().toISOString() })
      .eq('attribution_token', token)
      .is('clicked_at', null) // only record the first click

  } catch {
    // Silently ignore — tracking should never block the user's navigation
  }

  return NextResponse.redirect(fallbackRedirect, { status: 302 })
}
