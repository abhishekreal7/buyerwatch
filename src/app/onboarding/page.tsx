import OnboardingWizard from '@/components/OnboardingWizard'
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
    .select('id, business_name')
    .eq('id', user.id)
    .single()

  if (profile?.business_name) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pt-16 items-center px-4">
      <OnboardingWizard />
    </div>
  )
}
