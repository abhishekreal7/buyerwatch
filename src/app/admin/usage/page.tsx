import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export default async function AdminUsagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !user.email) {
    redirect('/login')
  }

  const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim()) : []
  
  if (!adminEmails.includes(user.email)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center sm:p-8">
        <h1 className="text-2xl font-bold mb-4">Unauthorized</h1>
        <p className="text-text-secondary">You do not have permission to view this page.</p>
        <Link href="/dashboard" className="mt-8 inline-flex min-h-11 items-center rounded-xl px-3 text-[#0A84FF] hover:bg-blue-50 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    )
  }

  // Fetch usage logs for last 7 days + profile details
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const dateStr = sevenDaysAgo.toISOString().split('T')[0]

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: usageLogs, error } = await admin
    .from('usage_logs')
    .select(`
      date,
      intent_calls,
      draft_calls,
      intent_input_tokens,
      intent_output_tokens,
      intent_cost_microusd,
      intent_model,
      draft_input_tokens,
      draft_output_tokens,
      draft_cost_microusd,
      draft_model,
      x_spend_cents,
      profiles (
        id,
        business_name,
        plan
      )
    `)
    .gte('date', dateStr)
    .order('date', { ascending: false })

  if (error) {
    console.error('Error fetching usage logs:', error)
  }

  // Aggregate by user
  const userStats: Record<string, {
    name: string
    plan: string
    intent: number
    drafts: number
    intentTokens: number
    draftTokens: number
    aiCostMicrousd: number
    models: Set<string>
    x_spend: number
  }> = {}
  
  usageLogs?.forEach(log => {
    const profile = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles
    if (!profile) return
    
    if (!userStats[profile.id]) {
      userStats[profile.id] = {
        name: profile.business_name || 'Unknown',
        plan: profile.plan,
        intent: 0,
        drafts: 0,
        intentTokens: 0,
        draftTokens: 0,
        aiCostMicrousd: 0,
        models: new Set<string>(),
        x_spend: 0,
      }
    }
    userStats[profile.id].intent += log.intent_calls
    userStats[profile.id].drafts += log.draft_calls
    userStats[profile.id].intentTokens +=
      log.intent_input_tokens + log.intent_output_tokens
    userStats[profile.id].draftTokens +=
      log.draft_input_tokens + log.draft_output_tokens
    userStats[profile.id].aiCostMicrousd +=
      log.intent_cost_microusd + log.draft_cost_microusd
    if (log.intent_model) userStats[profile.id].models.add(log.intent_model)
    if (log.draft_model) userStats[profile.id].models.add(log.draft_model)
    userStats[profile.id].x_spend += log.x_spend_cents
  })

  return (
    <div className="min-h-screen bg-background p-4 text-text-primary sm:p-8 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Admin Usage Dashboard</h1>
            <p className="text-text-secondary mt-2">Aggregate spend and usage across users for the last 7 days.</p>
          </div>
          <Link href="/dashboard" className="btn-secondary">
            Back to App
          </Link>
        </div>

        <div className="glass rounded-2xl overflow-hidden border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-gray-50 text-sm font-medium text-text-secondary">
                  <th className="px-6 py-4">User / Business</th>
                  <th className="px-6 py-4">Plan</th>
                  <th className="px-6 py-4 text-right">Intent Scores</th>
                  <th className="px-6 py-4 text-right">Draft Reservations</th>
                  <th className="px-6 py-4 text-right">Intent Tokens</th>
                  <th className="px-6 py-4 text-right">Draft Tokens</th>
                  <th className="px-6 py-4 text-right">AI Spend ($)</th>
                  <th className="px-6 py-4 text-right">X Spend ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.values(userStats).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-text-secondary">
                      No usage data recorded in the last 7 days.
                    </td>
                  </tr>
                ) : (
                  Object.entries(userStats).map(([userId, stats]) => (
                    <tr key={userId} className="hover:bg-black/10 transition-colors">
                      <td className="px-6 py-4 font-medium">{stats.name}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          stats.plan === 'growth' ? 'bg-[#0A84FF]/10 text-[#0A84FF] border-[#0A84FF]/20' :
                          stats.plan === 'pro' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-gray-50 text-text-secondary border-border'
                        }`}>
                          {stats.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums">{stats.intent.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right tabular-nums">{stats.drafts.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right tabular-nums">{stats.intentTokens.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right tabular-nums">
                        {stats.draftTokens.toLocaleString()}
                        {stats.models.size > 0 && (
                          <span className="mt-1 block max-w-48 truncate text-xs text-text-secondary" title={[...stats.models].join(', ')}>
                            {[...stats.models].join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums font-mono">${(stats.aiCostMicrousd / 1_000_000).toFixed(4)}</td>
                      <td className="px-6 py-4 text-right tabular-nums font-mono">${(stats.x_spend / 100).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
