import OnboardingWizard from '@/components/OnboardingWizard'
import { normalizePlan } from '@/lib/plan-limits'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { BrandLogo } from '@/components/BrandLogo'
import { OnboardingHeaderActions } from '@/components/OnboardingHeaderActions'

export default async function OnboardingPage() {
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
    redirect('/dashboard')
  }

  return (
    <div className="min-h-dvh overflow-y-auto bg-background px-4 pb-8 pt-5 md:pb-10 md:pt-6">
      <header className="mx-auto mb-5 flex w-full max-w-[600px] items-center justify-between">
        <BrandLogo size="sm" />
        <OnboardingHeaderActions />
      </header>
      <OnboardingWizard plan={normalizePlan(profile?.plan)} />
    </div>
  )
}

