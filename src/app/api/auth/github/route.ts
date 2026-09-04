import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  normalizeSelectedBillingCadence,
  normalizeSelectedBillingPlan,
  selectedPlanForSignup,
  withSelectedPlan,
} from '@/lib/billing-selection'

export const dynamic = 'force-dynamic'

function errorRedirect(requestUrl: URL) {
  return NextResponse.redirect(
    new URL('/login?error=github_oauth_unavailable', requestUrl),
  )
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const destination = requestUrl.searchParams.get('next') === 'signup' ? 'signup' : 'login'
  const selectedPlan = destination === 'signup'
    ? selectedPlanForSignup(requestUrl.searchParams.get('plan'))
    : normalizeSelectedBillingPlan(requestUrl.searchParams.get('plan'))
  const selectedBilling = normalizeSelectedBillingCadence(requestUrl.searchParams.get('billing'))

  try {
    const supabase = await createClient()
    const redirectTo = new URL(
      withSelectedPlan('/auth/callback', selectedPlan, selectedBilling),
      requestUrl.origin,
    ).toString()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo },
    })

    if (error || !data.url) {
      console.error('[auth] GitHub OAuth start failed:', error?.message || 'Missing provider URL')
      return errorRedirect(requestUrl)
    }

    return NextResponse.redirect(data.url)
  } catch (error) {
    console.error('[auth] GitHub OAuth route failed:', error)
    return errorRedirect(requestUrl)
  }
}
