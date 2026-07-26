import DashboardLayout, { type DashboardBootstrap } from '@/components/DashboardLayout'
import { getPlanLimits, normalizePlan } from '@/lib/plan-limits'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [profileResult, opportunitiesResult, draftsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('auto_send_enabled, plan, draft_count, draft_month, business_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('monitored_threads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['pending', 'needs_manual_reply']),
    supabase
      .from('monitored_threads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'drafted'),
  ])

  const profile = profileResult.data
  const plan = normalizePlan(profile?.plan)
  const limit = getPlanLimits(plan).aiDraftsPerMonth
  const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`
  const used = profile?.draft_month === currentMonth
    ? Math.min(Math.max(profile.draft_count ?? 0, 0), limit)
    : 0
  const userMetadata = user.user_metadata
  const userName = userMetadata?.full_name || userMetadata?.name || profile?.business_name || (user.email ? user.email.split('@')[0] : 'Iona Rollins')
  const bootstrap: DashboardBootstrap = {
    autoSend: profile?.auto_send_enabled ?? false,
    plan,
    credits: { used, limit },
    opportunityCount: opportunitiesResult.count ?? 0,
    draftCount: draftsResult.count ?? 0,
    user: {
      name: userName,
      email: user.email,
      avatarUrl: userMetadata?.avatar_url || userMetadata?.picture,
    },
  }

  return (
    <DashboardLayout userId={user.id} initialData={bootstrap}>
      {children}
    </DashboardLayout>
  )
}
