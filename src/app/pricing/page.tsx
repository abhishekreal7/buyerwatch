import Link from 'next/link'
import { getProviderCapabilities } from '@/lib/env'
import { BrandLogo } from '@/components/BrandLogo'
import type { PlanTier } from '@/lib/plan-limits'
import { getEntitledPlan } from '@/lib/billing-entitlements'
import { getDodoBillingSelectionFromProductId } from '@/lib/dodo'
import { createClient } from '@/utils/supabase/server'
import { PricingClient } from './PricingClient'

export const metadata = {
  title: 'Pricing',
  description: 'Compare BuyerWatch plans. Starter begins with a card-required 7-day free trial, limited intent scoring, and one guarded automatic reply.',
  alternates: { canonical: '/pricing' },
}

export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const billingEnabled = getProviderCapabilities().billing
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null
  let currentPlan: PlanTier | null = null
  let currentCadence: 'monthly' | 'annual' | null = null

  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, billing_status, billing_subscription_id, billing_product_id')
      .eq('id', userId)
      .maybeSingle()

    const entitledPlan = getEntitledPlan(profile)
    if (entitledPlan !== 'free') currentPlan = entitledPlan
    const currentSelection = getDodoBillingSelectionFromProductId(profile?.billing_product_id)
    if (currentSelection?.plan === currentPlan) currentCadence = currentSelection.cadence
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans selection:bg-black selection:text-white">
      {/* Nav */}
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 sm:py-6">
        <Link href="/" className="flex min-h-11 items-center gap-2 hover:opacity-80 transition-opacity">
          <BrandLogo />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href={userId ? '/dashboard' : '/login'}
            className="inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors"
          >
            {userId ? 'Dashboard' : 'Log in'}
          </Link>
          <Link
            href={userId ? '/settings?section=plan' : '/signup?plan=starter&billing=monthly'}
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-white bg-[#0A0A0A] hover:bg-[#1C1C1E] px-4 py-2 rounded-xl transition-colors"
          >
            {userId ? 'Manage plan' : 'Get started'}
          </Link>
        </div>
      </nav>

      {/* Header */}
      <div className="px-4 pb-10 pt-12 text-center sm:px-6 sm:pb-12 sm:pt-16">
        <p className="mb-4 text-[12px] font-bold uppercase tracking-widest text-[#888]">
          Pricing
        </p>
        <h1 className="mb-4 text-[40px] font-bold leading-tight tracking-tight text-[#0A0A0A] sm:text-[52px]">
          Simple plans that<br className="hidden sm:block" /> scale with you
        </h1>
        <p className="text-[17px] text-[#666666] max-w-[440px] mx-auto leading-relaxed">
          Start with a card-required 7-day trial. Score real buyer intent and test one guarded automatic reply.
        </p>
      </div>

      {/* Toggle + Plans (client) */}
      <PricingClient
        billingEnabled={billingEnabled}
        currentPlan={currentPlan}
        currentCadence={currentCadence}
        isAuthenticated={Boolean(userId)}
      />

      {/* Footer */}
      <div className="text-center pb-12 text-[13px] text-[#888888]">
        <p>
          Questions?{' '}
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center align-middle underline underline-offset-4 hover:text-[#0A0A0A] transition-colors"
          >
            Talk to us
          </Link>
        </p>
      </div>
    </div>
  )
}
