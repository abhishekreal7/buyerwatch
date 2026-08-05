import OnboardingWizard from '@/components/OnboardingWizard'
import { normalizePlan } from '@/lib/plan-limits'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { BrandLogo } from '@/components/BrandLogo'
import { OnboardingHeaderActions } from '@/components/OnboardingHeaderActions'
import {
  afterAuthenticationDestination,
  normalizeSelectedBillingCadence,
  normalizeSelectedBillingPlan,
} from '@/lib/billing-selection'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; billing?: string }>
}) {
  const query = await searchParams
  const selectedPlan = normalizeSelectedBillingPlan(query.plan)
  const selectedBilling = normalizeSelectedBillingCadence(query.billing)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if they already finished onboarding
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, business_name, plan')
    .eq('id', user.id)
    .single()

  if (profile?.business_name) {
    redirect(afterAuthenticationDestination(selectedPlan, true, selectedBilling))
  }

  return (
    <div className="min-h-dvh overflow-y-auto bg-background px-4 pb-8 pt-5 md:pb-10 md:pt-6">
      <header className="mx-auto mb-5 flex w-full max-w-[600px] items-center justify-between">
        <BrandLogo size="sm" />
        <OnboardingHeaderActions selectedPlan={selectedPlan} selectedBilling={selectedBilling} />
      </header>
      <OnboardingWizard
        plan={normalizePlan(profile?.plan)}
        selectedPlan={selectedPlan}
        selectedBilling={selectedBilling}
      />
    </div>
  )
}
