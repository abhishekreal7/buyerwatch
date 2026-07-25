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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <h1 className="text-2xl font-bold mb-4">Unauthorized</h1>
        <p className="text-text-secondary">You do not have permission to view this page.</p>
        <Link href="/dashboard" className="mt-8 text-[#0A84FF] hover:underline">
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
      gemini_calls,
      claude_calls,
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
    gemini: number
    claude: number
    x_spend: number
  }> = {}
  
  usageLogs?.forEach(log => {
    const profile = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles
    if (!profile) return
    
    if (!userStats[profile.id]) {
      userStats[profile.id] = {
        name: profile.business_name || 'Unknown',
        plan: profile.plan,
        gemini: 0,
        claude: 0,
        x_spend: 0,
      }
    }
    userStats[profile.id].gemini += log.gemini_calls
    userStats[profile.id].claude += log.claude_calls
    userStats[profile.id].x_spend += log.x_spend_cents
  })

  return (
    <div className="min-h-screen bg-background p-8 md:p-12 text-text-primary">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Usage Dashboard</h1>
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
                <tr className="bg-black/20 border-b border-border text-sm font-medium text-text-secondary">
                  <th className="px-6 py-4">User / Business</th>
                  <th className="px-6 py-4">Plan</th>
                  <th className="px-6 py-4 text-right">Gemini Calls</th>
                  <th className="px-6 py-4 text-right">Claude Calls</th>
                  <th className="px-6 py-4 text-right">X Spend ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.values(userStats).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-text-secondary">
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
                          stats.plan === 'pro' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                          'bg-white/10 text-text-secondary border-border'
                        }`}>
                          {stats.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums">{stats.gemini.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right tabular-nums">{stats.claude.toLocaleString()}</td>
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
