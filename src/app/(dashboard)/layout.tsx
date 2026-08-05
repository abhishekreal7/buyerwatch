import DashboardLayout, { type DashboardBootstrap } from '@/components/DashboardLayout'
import { normalizePlan } from '@/lib/plan-limits'
import {
  getCurrentUsageMonth,
  getPlanLimitsWithAddons,
  sumMonthlyAddonCredits,
} from '@/lib/billing-addons'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  const userId = typeof claims?.sub === 'string' ? claims.sub : null

  if (claimsError || !claims || !userId) {
    redirect('/login')
  }

  const usageMonth = getCurrentUsageMonth()
  const [profileResult, unreviewedResult, addonCreditsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('auto_send_enabled, plan, draft_count, draft_month, business_name')
      .eq('id', userId)
      .single(),
    supabase
      .from('monitored_threads')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['pending', 'drafted', 'needs_manual_reply'])
      .is('reviewed_at', null)
      .limit(1),
    supabase
      .from('billing_addon_credits')
      .select('addon_type, credits')
      .eq('user_id', userId)
      .eq('usage_month', usageMonth),
  ])

  const profile = profileResult.data
  const plan = normalizePlan(profile?.plan)
  const addonCredits = sumMonthlyAddonCredits(addonCreditsResult.data)
  const limit = getPlanLimitsWithAddons(plan, addonCredits).aiDraftsPerMonth
  const currentMonth = usageMonth
  const used = profile?.draft_month === currentMonth
    ? Math.max(profile.draft_count ?? 0, 0)
    : 0
  const userMetadata = (claims.user_metadata ?? {}) as Record<string, string | undefined>
  const email = typeof claims.email === 'string' ? claims.email : undefined
  const userName = userMetadata.full_name || userMetadata.name || profile?.business_name || (email ? email.split('@')[0] : 'Account')
  const bootstrap: DashboardBootstrap = {
    autoSend: profile?.auto_send_enabled ?? false,
    plan,
    credits: { used, limit },
    hasUnreviewedOpportunities: (unreviewedResult.data?.length ?? 0) > 0,
    user: {
      name: userName,
      email,
      avatarUrl: userMetadata.avatar_url || userMetadata.picture,
    },
  }

  return (
    <DashboardLayout userId={userId} initialData={bootstrap}>
      {children}
    </DashboardLayout>
  )
}
