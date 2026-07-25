import OnboardingWizard from '@/components/OnboardingWizard'
import { normalizePlan } from '@/lib/plan-limits'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

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
    <div className="h-dvh bg-background flex flex-col items-center overflow-hidden px-4 pt-8 pb-8 md:pt-10 md:pb-10">
      <OnboardingWizard plan={normalizePlan(profile?.plan)} />
    </div>
  )
}
