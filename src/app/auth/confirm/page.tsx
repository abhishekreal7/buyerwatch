import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { afterAuthenticationDestination } from '@/lib/billing-selection'
import { ConfirmClientHandler } from './ConfirmClientHandler'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    code?: string
    token_hash?: string
    type?: string
    plan?: string
    billing?: string
    error?: string
    error_description?: string
  }>
}

export default async function AuthConfirmPage(props: Props) {
  const searchParams = await props.searchParams
  const code = searchParams.code
  const tokenHash = searchParams.token_hash
  const type = searchParams.type
  const selectedPlan = searchParams.plan
  const selectedBilling = searchParams.billing
  const errorDescription = searchParams.error_description || searchParams.error

  if (errorDescription) {
    redirect(`/login?error=${encodeURIComponent(errorDescription)}`)
  }

  // If server-side params are present, exchange them immediately
  if (code || (tokenHash && type)) {
    const supabase = await createClient()
    let user = null

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error && data?.user) {
        user = data.user
      }
    } else if (tokenHash && type) {
      const { data, error } = await supabase.auth.verifyOtp({
        type: type as any,
        token_hash: tokenHash,
      })
      if (!error && data?.user) {
        user = data.user
      }
    }

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, business_name')
        .eq('id', user.id)
        .maybeSingle()

      const hasOnboarded = Boolean(profile?.business_name)
      redirect(afterAuthenticationDestination(selectedPlan, hasOnboarded, selectedBilling))
    }
  }

  // If no server query params exist (common when Supabase redirects with a hash fragment
  // such as #access_token=...&refresh_token=...), render the client handler to inspect
  // window.location.hash and complete authentication seamlessly without redirecting to login.
  return (
    <ConfirmClientHandler
      selectedPlan={selectedPlan}
      selectedBilling={selectedBilling}
    />
  )
}
