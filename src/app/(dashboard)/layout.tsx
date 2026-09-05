import DashboardLayout, { type DashboardBootstrap } from '@/components/DashboardLayout'
import { getEntitledPlan } from '@/lib/billing-entitlements'
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
  const [profileResult, addonCreditsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('auto_send_enabled, plan, billing_status, billing_subscription_id, draft_count, draft_month, business_name')
      .eq('id', userId)
      .single(),
    supabase
      .from('billing_addon_credits')
      .select('addon_type, credits')
      .eq('user_id', userId)
      .eq('usage_month', usageMonth),
  ])

  const profile = profileResult.data
  const plan = getEntitledPlan(profile)
  const addonCredits = sumMonthlyAddonCredits(addonCreditsResult.data)
  const limit = getPlanLimitsWithAddons(plan, addonCredits).aiDraftsPerMonth
  const currentMonth = usageMonth
  const used = profile?.draft_month === currentMonth
    ? Math.max(profile.draft_count ?? 0, 0)
    : 0
  const userMetadata = (claims.user_metadata ?? {}) as Record<string, string | undefined>
  const email = typeof claims.email === 'string' ? claims.email : undefined
  const userName = userMetadata.custom_name || userMetadata.full_name || userMetadata.name || profile?.business_name || (email ? email.split('@')[0] : 'Account')
  const avatarUrl = userMetadata.custom_avatar_url || userMetadata.avatar_url || userMetadata.picture
  const bootstrap: DashboardBootstrap = {
    autoSend: plan !== 'free' && (profile?.auto_send_enabled ?? false),
    plan,
    credits: { used, limit },
    user: {
      name: userName,
      email,
      avatarUrl,
    },
  }

  return (
    <DashboardLayout userId={userId} initialData={bootstrap}>
      {children}
    </DashboardLayout>
  )
}
