'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle, FileText, Send, AlertTriangle, Activity
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Cell, LabelList
} from 'recharts'
import { AppPage } from '@/components/AppPage'
import { RadialGauge } from '@/components/RadialGauge'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { formatDistanceToNow, subDays, startOfDay, isAfter, isBefore, format } from 'date-fns'

// Custom Label for Horizontal Bar Chart
const CustomBarLabel = (props: any) => {
  const { x, y, width, height, value, index, platformData } = props

  if (x == null || y == null || width == null || height == null) return null

  const isPrimary = platformData[index]?.isPrimary
  const labelWidth = 44

  const cx = x + width - (labelWidth / 2) - 8
  const cy = y + height / 2

  const isSmall = width < 60
  const finalCx = isSmall ? x + width + (labelWidth / 2) + 8 : cx

  if (isPrimary) {
    return (
      <g>
        <rect x={finalCx - 20} y={cy - 12} width="40" height="24" rx="12" fill="white" />
        <text x={finalCx} y={cy} dy={4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#FF3B30">
          {value}%
        </text>
      </g>
    )
  }

  return (
    <g>
      {isSmall && <rect x={finalCx - 20} y={cy - 12} width="40" height="24" rx="12" fill="#F2F2F7" />}
      <text x={finalCx} y={cy} dy={4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#8E8E93">
        {value}%
      </text>
    </g>
  )
}

// HIGH_INTENT_THRESHOLD must match the dashboard stat card (intent_score >= 80)
const HIGH_INTENT_THRESHOLD = 80

// Custom Tooltip for Lead Discovery Chart
const LeadDiscoveryTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const discovered = payload.find((p: any) => p.dataKey === 'discovered')
    const qualified = payload.find((p: any) => p.dataKey === 'qualified')
    return (
      <div className="bg-surface border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.08)] rounded-xl px-4 py-3 text-sm min-w-[160px] z-50 relative">
        <p className="font-semibold text-text-primary mb-2">{label}</p>
        {discovered && (
          <p className="flex items-center justify-between gap-4 text-text-secondary mb-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0A0A0A]" />
              <span className="font-medium">Discovered</span>
            </span>
            <span className="font-bold text-text-primary">{discovered.value}</span>
          </p>
        )}
        {qualified && (
          <p className="flex items-center justify-between gap-4 text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0A84FF]" />
              <span className="font-medium">Qualified</span>
            </span>
            <span className="font-bold text-[#0A84FF]">{qualified.value}</span>
          </p>
        )}
      </div>
    )
  }
  return null
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    stats: { found: number, drafted: number, sent: number, sentThisMonth: number, sentLastMonth: number }
    trendData: { date: string, discovered: number, qualified: number }[]
    activity: any[]
    topKeywords: any[]
    needsAttention: any[]
    replyRate: number
    platformData: any[]
  } | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Parallel fetching for performance
      const [profileRes, connsRes, threadsRes, analyticsRes, feedbackRes] = await Promise.all([
        supabase.from('profiles').select('auto_send_enabled').eq('id', user.id).single(),
        supabase.from('platform_connections').select('platform').eq('user_id', user.id),
        supabase.from('monitored_threads').select('*').eq('user_id', user.id),
        supabase.from('reply_analytics').select('was_sent, sent_at').eq('user_id', user.id),
        supabase.from('draft_feedback').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
      ])

      const threads = threadsRes.data || []
      const analytics = analyticsRes.data || []
      const feedback = feedbackRes.data || []
      const conns = connsRes.data || []
      const profile = profileRes.data

      const now = new Date()
      const thirtyDaysAgo = subDays(now, 30)
      const sixtyDaysAgo = subDays(now, 60)
      const sevenDaysAgo = subDays(now, 7)

      // --- STATS ---
      const found = threads.length
      const draftedThreads = threads.filter(t => t.status === 'drafted' || t.status === 'needs_manual_reply')
      const draftedCount = draftedThreads.length

      const sentAnalytics = analytics.filter(a => a.was_sent && a.sent_at)
      const totalSent = sentAnalytics.length

      const sentThisMonth = sentAnalytics.filter(a => isAfter(new Date(a.sent_at), thirtyDaysAgo)).length
      const sentLastMonth = sentAnalytics.filter(a =>
        isAfter(new Date(a.sent_at), sixtyDaysAgo) && isBefore(new Date(a.sent_at), thirtyDaysAgo)
      ).length

      // --- TREND DATA (Last 30 Days) ---
      // Discovered = all threads found that day
      // Qualified = threads where intent_score >= HIGH_INTENT_THRESHOLD (same as dashboard "High Intent" stat)
      const discoveredMap: Record<string, number> = {}
      const qualifiedMap: Record<string, number> = {}
      for (let i = 29; i >= 0; i--) {
        const d = subDays(startOfDay(now), i)
        const key = format(d, 'MMM d')
        discoveredMap[key] = 0
        qualifiedMap[key] = 0
      }

      threads.forEach(t => {
        const d = new Date(t.created_at)
        if (isAfter(d, thirtyDaysAgo)) {
          const dateStr = format(d, 'MMM d')
          if (discoveredMap[dateStr] !== undefined) {
            discoveredMap[dateStr]++
            if (Number(t.intent_score) >= HIGH_INTENT_THRESHOLD) {
              qualifiedMap[dateStr]++
            }
          }
        }
      })
      const trendData = Object.keys(discoveredMap).map(date => ({
        date,
        discovered: discoveredMap[date],
        qualified: qualifiedMap[date],
      }))

      // --- ACTIVITY FEED ---
      const activityEvents: any[] = []

      // Approvals & Auto-sends
      feedback.forEach(f => {
        if (f.action_type === 'APPROVED' || f.action_type === 'EDITED_APPROVED') {
          activityEvents.push({
            id: `fb-${f.id}`, type: 'approved', timestamp: new Date(f.created_at),
            label: `Approved reply to r/${f.target_community || 'unknown'}`
          })
        } else if (f.action_type === 'AUTO_SENT') {
          activityEvents.push({
            id: `fb-${f.id}`, type: 'auto', timestamp: new Date(f.created_at),
            label: `Auto-sent reply to r/${f.target_community || 'unknown'}`
          })
        }
      })

      // Drafts ready
      draftedThreads.forEach(t => {
        activityEvents.push({
          id: `th-${t.id}`, type: 'draft', timestamp: new Date(t.created_at),
          label: `Draft ready: "${t.author || 'thread'}"`
        })
      })

      // Sort and take top 6
      activityEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      const recentActivity = activityEvents.slice(0, 6)

      // --- REPLY RATE ---
      const totalDraftedEver = totalSent + draftedCount + feedback.filter(f => f.action_type === 'REJECTED' || f.action_type === 'SKIPPED').length
      const replyRate = totalDraftedEver > 0 ? (totalSent / totalDraftedEver) * 100 : 0

      // --- PLATFORM TRAFFIC ---
      const platformCounts = { reddit: 0, bluesky: 0 }
      threads.forEach(t => {
        if (t.status === 'replied') {
          const p = t.platform.toLowerCase()
          if (p === 'reddit') platformCounts.reddit++
          if (p === 'bluesky') platformCounts.bluesky++
        }
      })
      const totalPlatforms = platformCounts.reddit + platformCounts.bluesky
      const rp = totalPlatforms > 0 ? Math.round((platformCounts.reddit / totalPlatforms) * 100) : 0
      const bp = totalPlatforms > 0 ? Math.round((platformCounts.bluesky / totalPlatforms) * 100) : 0
      const platformData = [
        { platform: 'Reddit', replies: platformCounts.reddit, color: '#FF453A', percentage: rp, isPrimary: rp >= bp },
        { platform: 'Bluesky', replies: platformCounts.bluesky, color: '#D1D1D6', percentage: bp, isPrimary: bp > rp }
      ]

      // --- NEEDS ATTENTION ---
      const alerts = []
      if (draftedCount > 0) {
        alerts.push({ id: 'drafts', type: 'warning', label: `${draftedCount} drafts ready for review`, actionLabel: 'Take action →', href: '/dashboard' })
      }
      if (!conns.some(c => c.platform === 'reddit')) {
        alerts.push({ id: 'reddit_api', type: 'warning', label: 'Reddit not connected', actionLabel: 'Connect Reddit →', href: '/settings' })
      }
      if (profile && !profile.auto_send_enabled) {
        alerts.push({ id: 'autosend', type: 'warning', label: 'Auto-send paused', actionLabel: 'Resume →', href: '/settings' })
      }

      setData({
        stats: { found, drafted: draftedCount, sent: totalSent, sentThisMonth, sentLastMonth },
        trendData,
        activity: recentActivity,
        topKeywords: [],
        needsAttention: alerts,
        replyRate,
        platformData
      })
      setLoading(false)
    }

    loadData()
  }, [])

  if (loading || !data) {
    return (
      <AppPage>
        <div className="w-full h-screen flex flex-col pt-12 items-center">
          <div className="w-8 h-8 rounded-full border-2 border-black/[0.08] border-t-text-primary animate-spin" />
          <p className="mt-4 text-text-tertiary text-sm font-medium">Loading analytics…</p>
        </div>
      </AppPage>
    )
  }

  // Delta calculation
  const delta = data.stats.sentThisMonth - data.stats.sentLastMonth
  const deltaPct = data.stats.sentLastMonth > 0
    ? Math.round((delta / data.stats.sentLastMonth) * 100)
    : (data.stats.sentThisMonth > 0 ? 100 : 0)
  const isPositive = deltaPct >= 0

  return (
    <AppPage>
      <div className="w-full max-w-[1200px] pb-12">
        <div className="mb-10">
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Reply performance and engagement metrics.</p>
        </div>

        <div className="flex flex-col gap-6">

          {/* ════════════════════ ROW 1 ════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Card: Lead Discovery */}
            <div className="lg:col-span-2 surface-ceramic border border-black/[0.04] p-8 flex flex-col relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Lead Discovery</h3>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-medium text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0A0A0A]" />
                    Discovered: <span className="font-bold text-text-primary">{data.stats.found}</span>
                  </span>
                  <span className="text-text-tertiary hidden sm:inline">|</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0A84FF]" />
                    Qualified: <span className="font-bold text-[#0A84FF]">{data.trendData.reduce((s, d) => s + d.qualified, 0)}</span>
                  </span>
                </div>
              </div>

              <div className="flex-1 mt-2 h-[200px] -ml-2 -mb-2 relative z-10">
                {data.stats.found === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/75 backdrop-blur-[0.5px] z-20">
                    <p className="text-[13.5px] font-bold text-text-primary mb-1">No leads discovered yet</p>
                    <p className="text-[12px] text-text-tertiary max-w-[280px] text-center leading-relaxed font-medium">
                      Create a keyword rule in <Link href="/keywords" className="text-[#0A84FF] hover:underline font-bold">Keywords</Link> to start monitoring.
                    </p>
                  </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trendData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorDiscovered" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0A0A0A" stopOpacity={0.05} />
                        <stop offset="95%" stopColor="#0A0A0A" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorQualified" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#0A84FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      axisLine={false} tickLine={false}
                      tick={{ fill: 'rgba(20, 18, 16, 0.38)', fontSize: 11, fontWeight: 500 }}
                      minTickGap={30}
                    />
                    <Tooltip content={<LeadDiscoveryTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.06)', strokeWidth: 1 }} />
                    {/* Discovered — dark primary line (always >= Qualified by construction) */}
                    <Area
                      type="monotone"
                      dataKey="discovered"
                      stroke="#0A0A0A"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorDiscovered)"
                      activeDot={{ r: 4, fill: '#0A0A0A', stroke: '#fff', strokeWidth: 2 }}
                    />
                    {/* Qualified — accent blue line (intent_score >= 80, same as dashboard High Intent) */}
                    <Area
                      type="monotone"
                      dataKey="qualified"
                      stroke="#0A84FF"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorQualified)"
                      activeDot={{ r: 5, fill: '#0A84FF', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right Card: Recent Activity */}
            <div className="surface-ceramic border border-black/[0.04] flex flex-col h-[380px] overflow-hidden">
              <div className="px-6 py-5 border-b border-black/[0.04] shrink-0 bg-white/50 backdrop-blur-sm z-10 sticky top-0">
                <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Recent Activity</h3>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar p-6 pt-2 relative">
                {data.activity.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                    <Activity className="w-6 h-6 text-text-tertiary mb-3" />
                    <p className="text-[13px] text-text-secondary">No recent activity.</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {data.activity.map((event, i) => (
                      <div key={event.id + i} className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-surface border border-black/[0.06] flex items-center justify-center shrink-0">
                          {event.type === 'approved' && <CheckCircle className="w-4 h-4 text-[#10B981]" />}
                          {event.type === 'draft' && <FileText className="w-4 h-4 text-[#F59E0B]" />}
                          {event.type === 'auto' && <Send className="w-4 h-4 text-[#0A84FF]" />}
                        </div>
                        <div className="flex-1 min-w-0 pt-1.5">
                          <p className="text-[13px] font-medium text-text-primary leading-snug truncate group-hover:text-clip group-hover:whitespace-normal transition-all">{event.label}</p>
                          <p className="text-[11.5px] text-text-tertiary mt-1">{formatDistanceToNow(event.timestamp, { addSuffix: true })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ════════════════════ ROW 2 ════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Card: Traffic by Platform */}
            <div className="surface-ceramic border border-black/[0.04] p-8 flex flex-col relative overflow-hidden">
              <h2 className="text-[16px] font-semibold text-text-primary tracking-tight mb-8">Traffic by Platform</h2>
              <div className="flex-1 min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.platformData || []}
                    layout="vertical"
                    margin={{ top: 0, right: 30, left: -20, bottom: 0 }}
                    barSize={40}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="rgba(0,0,0,0.04)" />
                    <XAxis type="number" hide domain={[0, 100]} />
                    <YAxis type="category" dataKey="platform" hide />
                    <Bar dataKey="percentage" radius={[8, 8, 8, 8]}>
                      {(data.platformData || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                      <LabelList dataKey="percentage" content={(props: any) => <CustomBarLabel {...props} platformData={data.platformData || []} />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex justify-center items-center gap-8 mt-6 pt-6 border-t border-black/[0.04]">
                {(data.platformData || []).map((p, i) => (
                  <span key={i} className="flex items-center gap-2 text-[15px] text-text-primary font-medium">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.isPrimary ? '#FF3B30' : '#E5E5EA' }} />
                    {p.platform}
                  </span>
                ))}
              </div>
            </div>

            {/* Middle Card: Reply Rate Gauge */}
            <div className="surface-ceramic border border-black/[0.04] p-8 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="w-full flex justify-between items-start mb-6 absolute top-6 left-6 right-6">
                <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Reply Rate</h3>
              </div>
              <div className="mt-8 scale-[1.15]">
                <RadialGauge percentage={data.replyRate} label="Drafted → Posted" />
              </div>
            </div>

            {/* Right Card: Needs Attention */}
            <div className="surface-ceramic border border-black/[0.04] overflow-hidden flex flex-col relative">
              <div className="px-6 pt-6 pb-4 border-b border-black/[0.04]">
                <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Needs Attention</h3>
              </div>
              <div className="flex-1 p-6 bg-surface-secondary/30">
                {data.needsAttention.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-[#10B981]/10 flex items-center justify-center mb-3">
                      <CheckCircle className="w-6 h-6 text-[#10B981]" strokeWidth={2.5} />
                    </div>
                    <p className="text-[14px] font-semibold text-text-primary">All caught up</p>
                    <p className="text-[13px] text-text-tertiary mt-1 max-w-[200px]">Nothing needs your attention right now.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {data.needsAttention.map(alert => (
                      <div key={alert.id} className="bg-surface border border-black/[0.06] rounded-[14px] p-4 flex flex-col shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                          <AlertTriangle className={`w-4 h-4 ${alert.type === 'error' ? 'text-[#EF4444]' : 'text-[#F59E0B]'}`} strokeWidth={2.5} />
                          <p className="text-[14px] font-semibold text-text-primary">{alert.label}</p>
                        </div>
                        <Link href={alert.href} className="text-[13px] font-semibold text-[#0A84FF] hover:text-[#0A84FF]/80 flex items-center gap-1 transition-colors w-fit">
                          {alert.actionLabel}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
    </AppPage>
  )
}
