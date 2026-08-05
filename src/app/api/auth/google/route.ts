import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { normalizeSelectedBillingPlan, withSelectedPlan } from '@/lib/billing-selection'

export const dynamic = 'force-dynamic'

function errorRedirect(requestUrl: URL, destination: 'login' | 'signup') {
  return NextResponse.redirect(
    new URL(`/${destination}?error=google_oauth_unavailable`, requestUrl),
  )
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const destination = requestUrl.searchParams.get('next') === 'signup' ? 'signup' : 'login'
  const selectedPlan = normalizeSelectedBillingPlan(requestUrl.searchParams.get('plan'))

  try {
    const supabase = await createClient()
    const redirectTo = new URL(withSelectedPlan('/auth/callback', selectedPlan), requestUrl.origin).toString()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })

    if (error || !data.url) {
      console.error('[auth] Google OAuth start failed:', error?.message || 'Missing provider URL')
      return errorRedirect(requestUrl, destination)
    }

    return NextResponse.redirect(data.url)
  } catch (error) {
    console.error('[auth] Google OAuth route failed:', error)
    return errorRedirect(requestUrl, destination)
  }
}
