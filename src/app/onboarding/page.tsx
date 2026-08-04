import OnboardingWizard from '@/components/OnboardingWizard'
import { normalizePlan } from '@/lib/plan-limits'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { BrandLogo } from '@/components/BrandLogo'
import { skipOnboardingAction } from '@/app/actions/onboarding'
import { signOutAction } from '@/app/actions/auth'

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
        <div className="flex items-center gap-1.5">
          <form action={skipOnboardingAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              Finish later
            </button>
          </form>
          <span className="text-gray-300 text-xs">|</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <OnboardingWizard plan={normalizePlan(profile?.plan)} />
    </div>
  )
}

