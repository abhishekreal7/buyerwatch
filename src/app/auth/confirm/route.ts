import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { afterAuthenticationDestination } from '@/lib/billing-selection'

/**
 * GET /auth/confirm
 *
 * Handles Supabase email confirmation redirects.
 * Supabase sends users here after they click the confirmation link in their
 * sign-up email. The URL carries a `code` query param (PKCE auth code) that
 * must be exchanged for a session.
 *
 * After confirming, routes the user:
 *   - No profile / no business_name → /onboarding (new user)
 *   - Profile exists with business_name → /dashboard (returning user)
 *   - Any error → /login?error=... with a human-readable message
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const selectedPlan = requestUrl.searchParams.get('plan')

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=Missing+confirmation+code', request.url)
    )
  }

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !user) {
    console.error('[auth/confirm] exchangeCodeForSession error:', error?.message)
    return NextResponse.redirect(
      new URL('/login?error=Email+confirmation+failed.+Please+try+again.', request.url)
    )
  }

  // Check if the user has completed onboarding
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, business_name')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.business_name) {
    return NextResponse.redirect(new URL(afterAuthenticationDestination(selectedPlan, false), request.url))
  }

  return NextResponse.redirect(new URL(afterAuthenticationDestination(selectedPlan, true), request.url))
}
