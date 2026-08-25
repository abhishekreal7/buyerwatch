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
    <div className="flex h-dvh flex-col overflow-hidden bg-background px-4 pb-4 pt-4 md:pb-6 md:pt-5">
      <header className="mx-auto mb-4 flex w-full max-w-[600px] shrink-0 items-center justify-between">
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
