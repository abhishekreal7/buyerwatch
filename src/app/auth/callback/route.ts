import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { friendlyAuthError } from '@/lib/auth-errors'
import { afterAuthenticationDestination } from '@/lib/billing-selection'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const oauthError = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error')
  const selectedPlan = requestUrl.searchParams.get('plan')
  const selectedBilling = requestUrl.searchParams.get('billing')

  if (oauthError) {
    console.error('OAuth callback error parameter:', oauthError)
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(friendlyAuthError(oauthError))}`, request.url)
    )
  }

  if (code) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error('exchangeCodeForSession error:', error.message)
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
    } catch (err: any) {
      console.error('Callback handler exception:', err)
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(friendlyAuthError(err.message))}`, request.url)
      )
    }
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
