'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { skipOnboardingAction } from '@/app/actions/onboarding'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  afterAuthenticationDestination,
  type SelectedBillingCadence,
  type SelectedBillingPlan,
} from '@/lib/billing-selection'

export function OnboardingHeaderActions({
  selectedPlan,
  selectedBilling,
}: {
  selectedPlan: SelectedBillingPlan | null
  selectedBilling: SelectedBillingCadence
}) {
  const [skipping, setSkipping] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [supabase] = useState(createClient)
  const router = useRouter()

  const handleSkip = async () => {
    if (skipping || signingOut) return
    setSkipping(true)
    toast.info('Finishing setup later...')
    try {
      await skipOnboardingAction(selectedPlan, selectedBilling)
    } catch {
      router.replace(afterAuthenticationDestination(selectedPlan, true, selectedBilling))
      return
    }
    router.replace(afterAuthenticationDestination(selectedPlan, true, selectedBilling))
  }

  const handleSignOut = async () => {
    if (skipping || signingOut) return
    setSigningOut(true)
    toast.info('Signing out...')
    try {
      await supabase.auth.signOut()
    } catch {
      // Ignore errors and force redirect
    }
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleSkip}
        disabled={skipping || signingOut}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:opacity-50"
      >
        {skipping ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
            <span>Redirecting...</span>
          </>
        ) : (
          <span>Finish later</span>
        )}
      </button>

      <span className="text-xs text-gray-300">|</span>

      <button
        type="button"
        onClick={handleSignOut}
        disabled={skipping || signingOut}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:opacity-50"
      >
        {signingOut ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            <span>Signing out...</span>
          </>
        ) : (
          <span>Sign out</span>
        )}
      </button>
    </div>
  )
}
