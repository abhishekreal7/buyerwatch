import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /auth/confirm
 *
 * Handles Supabase email confirmation links (signup verification, magic links).
 * Supabase sends: ?token_hash=...&type=signup (or type=magiclink etc.)
 *
 * This is separate from /auth/callback which handles OAuth (Google) PKCE flow.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as
    | 'signup'
    | 'magiclink'
    | 'recovery'
    | 'invite'
    | null

  if (tokenHash && type) {
    const supabase = await createClient()

    const { data: { user }, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (error) {
      console.error('[auth/confirm] verifyOtp error:', error.message)
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent('Verification link expired or invalid. Please try again.')}`, request.url)
      )
    }

    if (user) {
      // Check if the user has completed onboarding
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, business_name')
        .eq('id', user.id)
        .single()

      if (!profile || !profile.business_name) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }

      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Fallback — bad or missing params
  return NextResponse.redirect(
    new URL('/login?error=Invalid+confirmation+link', request.url)
  )
}
