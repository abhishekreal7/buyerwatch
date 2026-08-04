import DashboardLayout, { type DashboardBootstrap } from '@/components/DashboardLayout'
import { getPlanLimits, normalizePlan } from '@/lib/plan-limits'
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

  const [profileResult, unreviewedResult] = await Promise.all([
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
  ])

  const profile = profileResult.data
  const plan = normalizePlan(profile?.plan)
  const limit = getPlanLimits(plan).aiDraftsPerMonth
  const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`
  const used = profile?.draft_month === currentMonth
    ? Math.min(Math.max(profile.draft_count ?? 0, 0), limit)
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
