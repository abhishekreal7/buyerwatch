import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { friendlyAuthError } from '@/lib/auth-errors'
import { afterAuthenticationDestination } from '@/lib/billing-selection'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const oauthError = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error')
  const selectedPlan = requestUrl.searchParams.get('plan')
  const selectedBilling = requestUrl.searchParams.get('billing')

  if (oauthError) {
    logger.warn({ code: 'oauth_provider_rejected' }, 'OAuth callback returned an error')
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(friendlyAuthError(oauthError))}`, request.url)
    )
  }

  if (code) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        logger.warn(
          { code: error.code ?? error.name },
          'OAuth session exchange failed',
        )
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`, request.url)
        )
      }

      const user = data?.user
      if (user) {
        // Check if user has completed onboarding profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, business_name')
          .eq('id', user.id)
          .maybeSingle()

        if (!profile || !profile.business_name) {
          return NextResponse.redirect(new URL(afterAuthenticationDestination(selectedPlan, false, selectedBilling), request.url))
        }

        return NextResponse.redirect(new URL(afterAuthenticationDestination(selectedPlan, true, selectedBilling), request.url))
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication callback failed'
      logger.error(
        { code: err instanceof Error ? err.name : 'unknown' },
        'OAuth callback handler failed',
      )
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(friendlyAuthError(message))}`, request.url)
      )
    }
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
