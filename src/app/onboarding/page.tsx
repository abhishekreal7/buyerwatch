import OnboardingWizard from '@/components/OnboardingWizard'
import { getEntitledPlan } from '@/lib/billing-entitlements'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { BrandLogo } from '@/components/BrandLogo'
import { OnboardingHeaderActions } from '@/components/OnboardingHeaderActions'
import {
  afterAuthenticationDestination,
  normalizeSelectedBillingCadence,
  normalizeSelectedBillingPlan,
  selectedPlanForSignup,
} from '@/lib/billing-selection'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; billing?: string }>
}) {
  const query = await searchParams
  const explicitPlan = normalizeSelectedBillingPlan(query.plan)
  const selectedBilling = normalizeSelectedBillingCadence(query.billing)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if they already finished onboarding
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, business_name, plan, billing_status, billing_subscription_id')
    .eq('id', user.id)
    .single()

  if (profile?.business_name) {
    redirect(afterAuthenticationDestination(explicitPlan, true, selectedBilling))
  }

  const selectedPlan = selectedPlanForSignup(explicitPlan)

  return (
    <div className="min-h-dvh overflow-y-auto bg-background px-4 pb-8 pt-5 md:pb-10 md:pt-6">
      <header className="mx-auto mb-5 flex w-full max-w-[600px] items-center justify-between">
        <BrandLogo size="sm" />
        <OnboardingHeaderActions selectedPlan={selectedPlan} selectedBilling={selectedBilling} />
      </header>
      <OnboardingWizard
        plan={getEntitledPlan(profile)}
        selectedPlan={selectedPlan}
        selectedBilling={selectedBilling}
      />
    </div>
  )
}
