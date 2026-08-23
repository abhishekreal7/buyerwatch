'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { formatDistanceToNow, subDays, startOfDay, isAfter, format } from 'date-fns'
import { useDashboardSession } from '@/components/DashboardContext'
import { fetchAllPages } from '@/lib/supabase-pagination'
import { normalizeHighIntentThreshold } from '@/lib/high-intent-threshold'
import { DataLoadError } from '@/components/DataLoadError'

type DeliveryActivity = {
  threadId: string
  state: 'sent' | 'failed' | 'uncertain' | 'cancelled'
  title: string
  subject: string
  message: string
  actionLabel: string
  actionHref: string
  updatedAt: string
}

// Custom Label for Horizontal Bar Chart
const CustomBarLabel = (props: any) => {
  const { x, y, width, height, value, index, platformData } = props

  if (x == null || y == null || width == null || height == null) return null

  const isPrimary = platformData[index]?.isPrimary
  const color = platformData[index]?.color || '#111111'
  const labelWidth = 44

  const cx = x + width - (labelWidth / 2) - 8
  const cy = y + height / 2

  const isSmall = width < 60
  const finalCx = isSmall ? x + width + (labelWidth / 2) + 8 : cx

  return (
    <g>
      <rect
        x={finalCx - 20}
        y={cy - 12}
        width="40"
        height="24"
        rx="12"
        fill="white"
        stroke={isPrimary ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.04)'}
      />
      <text
        x={finalCx}
        y={cy}
        dy={4}
        textAnchor="middle"
        fontSize="11"
        fontWeight={isPrimary ? '700' : '650'}
        fill={isPrimary ? color : '#4B5563'}
      >
        {value}%
      </text>
    </g>
  )
}

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF5101',
  bluesky: '#0A84FF',
  x: '#111111',
}

const PLATFORM_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  bluesky: 'Bluesky',
  x: 'X',
}
const LEAD_DISCOVERY_RANGES = [7, 14, 30] as const
type LeadDiscoveryRange = typeof LEAD_DISCOVERY_RANGES[number]

function normalizePlatform(value: unknown) {
  const platform = String(value || '').trim().toLowerCase()
  if (platform === 'twitter' || platform === 'x.com') return 'x'
  if (platform === 'reddit.com') return 'reddit'
  if (platform === 'bsky' || platform === 'bsky.app') return 'bluesky'
  return platform
}

// Custom Tooltip for Lead Discovery Chart
const LeadDiscoveryTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const discovered = payload.find((p: any) => p.dataKey === 'discovered')
    const qualified = payload.find((p: any) => p.dataKey === 'qualified')
    return (
      <div className="bg-white/95 border border-black/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.10)] rounded-xl px-3.5 py-3 text-[12.5px] min-w-[142px] z-50 relative backdrop-blur">
        <p className="font-semibold text-text-primary mb-2">{label}</p>
        {discovered && (
          <p className="flex items-center justify-between gap-3 text-text-secondary mb-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0A0A0A]" />
              <span className="font-medium">Discovered</span>
            </span>
            <span className="font-bold text-text-primary">{discovered.value}</span>
          </p>
        )}
        {qualified && (
          <p className="flex items-center justify-between gap-3 text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0A84FF]" />
              <span className="font-medium">High-intent</span>
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
  const [loadFailed, setLoadFailed] = useState(false)
  const hasLoadedDataRef = useRef(false)
  const [data, setData] = useState<{
    stats: { found: number, drafted: number, sent: number, sentThisMonth: number, sentLastMonth: number }
    trendData: { date: string, discovered: number, qualified: number }[]
    activity: Array<{
      id: string
      type: 'approved' | 'draft' | 'auto' | DeliveryActivity['state']
      timestamp: Date
      label: string
      detail?: string
      actionLabel?: string
      actionHref?: string
    }>
    topKeywords: any[]
    needsAttention: any[]
    replyRate: number
    platformData: any[]
    highIntentThreshold: number
    attributionStats: { clicks: number; conversions: number; totalRevenue: number }
  } | null>(null)
  const [leadDiscoveryRange, setLeadDiscoveryRange] = useState<LeadDiscoveryRange>(14)

  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()

  const loadData = useCallback(async () => {
      const isInitialLoad = !hasLoadedDataRef.current
      if (isInitialLoad) {
        setLoading(true)
        setLoadFailed(false)
      }

      try {
      const now = new Date()
      const thirtyDaysAgo = subDays(now, 30)
      const sixtyDaysAgo = subDays(now, 60)
      const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()
      const sixtyDaysAgoIso = sixtyDaysAgo.toISOString()
      // Parallel fetching for performance
      const [
        profileRes,
        connsRes,
        threadsRes,
        totalSentRes,
        sentThisMonthRes,
        sentLastMonthRes,
        feedbackRes,
        clicksRes,
        conversionsRes,
        revenueRes,
        deliveryActivityRes,
      ] = await Promise.all([
        supabase.from('profiles').select('auto_send_enabled, high_intent_threshold').eq('id', userId).single(),
        supabase.from('platform_connections').select('platform').eq('user_id', userId),
        fetchAllPages((from, to) => supabase.from('monitored_threads').select('id, status, platform, intent_score, created_at, author, keywords(term)').eq('user_id', userId).not('intent_score', 'is', null).range(from, to)),
        supabase.from('reply_analytics').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('was_sent', true).not('sent_at', 'is', null),
        supabase.from('reply_analytics').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('was_sent', true).gte('sent_at', thirtyDaysAgoIso),
        supabase.from('reply_analytics').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('was_sent', true).gte('sent_at', sixtyDaysAgoIso).lt('sent_at', thirtyDaysAgoIso),
        supabase.from('draft_feedback').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase.from('reply_attribution').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('clicked_at', 'is', null),
        supabase.from('reply_attribution').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('converted_at', 'is', null),
        fetchAllPages((from, to) => supabase.from('reply_attribution').select('revenue_usd').eq('user_id', userId).not('revenue_usd', 'is', null).range(from, to)),
        fetch('/api/replies/activity', { cache: 'no-store' }),
      ])

      const queryError = [
        profileRes,
        connsRes,
        threadsRes,
        totalSentRes,
        sentThisMonthRes,
        sentLastMonthRes,
        feedbackRes,
        clicksRes,
        conversionsRes,
        revenueRes,
      ].find(result => result.error)?.error
      if (queryError) throw queryError
      if (!deliveryActivityRes.ok) throw new Error('delivery_activity_load_failed')

      const threads = threadsRes.data || []
      const feedback = feedbackRes.data || []
      const conns = connsRes.data || []
      const profile = profileRes.data
      const highIntentThreshold = normalizeHighIntentThreshold(profile?.high_intent_threshold)

      // --- STATS ---
      const found = threads.length
      const draftedThreads = threads.filter(t => t.status === 'drafted' || t.status === 'needs_manual_reply')
      const draftedCount = draftedThreads.length

      const totalSent = totalSentRes.count ?? 0
      const sentThisMonth = sentThisMonthRes.count ?? 0
      const sentLastMonth = sentLastMonthRes.count ?? 0

      // --- TREND DATA (Last 30 Days) ---
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
            if (Number(t.intent_score) >= highIntentThreshold) {
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
      const activityEvents: Array<{
        id: string
        type: 'approved' | 'draft' | 'auto' | DeliveryActivity['state']
        timestamp: Date
        label: string
        detail?: string
        actionLabel?: string
        actionHref?: string
      }> = []

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

      draftedThreads.forEach(t => {
        activityEvents.push({
          id: `th-${t.id}`, type: 'draft', timestamp: new Date(t.created_at),
          label: `Draft ready: "${t.author || 'thread'}"`
        })
      })

      const deliveryPayload = await deliveryActivityRes.json() as { activity?: DeliveryActivity[] }
      for (const item of deliveryPayload.activity ?? []) {
        activityEvents.push({
          id: `delivery-${item.threadId}-${item.state}-${item.updatedAt}`,
          type: item.state,
          timestamp: new Date(item.updatedAt),
          label: item.title,
          detail: item.message,
          actionLabel: item.actionLabel,
          actionHref: item.actionHref,
        })
      }

      activityEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      const recentActivity = activityEvents.slice(0, 6)

      // --- REPLY RATE ---
      const totalDraftedEver = totalSent + draftedCount + feedback.filter(f => f.action_type === 'REJECTED' || f.action_type === 'SKIPPED').length
      const replyRate = totalDraftedEver > 0 ? (totalSent / totalDraftedEver) * 100 : 0

      // --- PLATFORM TRAFFIC ---
      const platformCounts: Record<string, number> = { reddit: 0, bluesky: 0, x: 0 }
      threads.forEach(t => {
        if (t.status === 'dismissed') return
        const platform = normalizePlatform(t.platform)
        if (platform in platformCounts) platformCounts[platform] += 1
      })
      const totalPlatforms = Object.values(platformCounts).reduce((sum, count) => sum + count, 0)
      const primaryPlatform = Object.entries(platformCounts)
        .sort(([, left], [, right]) => right - left)[0]?.[0]
      const platformData = (Object.keys(platformCounts) as Array<keyof typeof platformCounts>)
        .filter(platform => platformCounts[platform] > 0 || platform !== 'x')
        .map(platform => ({
          platform: PLATFORM_LABELS[platform],
          count: platformCounts[platform],
          color: PLATFORM_COLORS[platform],
          percentage: totalPlatforms > 0
            ? Math.round((platformCounts[platform] / totalPlatforms) * 100)
            : 0,
          isPrimary: platform === primaryPlatform,
        }))

      // --- NEEDS ATTENTION ---
      const alerts = []
      if (draftedCount > 0) {
        alerts.push({ id: 'drafts', type: 'warning', label: `${draftedCount} drafts ready for review`, actionLabel: 'Take action →', href: '/dashboard' })
      }
      if (threads.some(thread => thread.platform === 'reddit') && !conns.some(c => c.platform === 'reddit')) {
        alerts.push({ id: 'reddit_api', type: 'warning', label: 'Reddit not connected', actionLabel: 'Connect Reddit →', href: '/settings' })
      }
      if (profile && !profile.auto_send_enabled) {
        alerts.push({ id: 'autosend', type: 'warning', label: 'Auto-send paused', actionLabel: 'Resume →', href: '/settings' })
      }

      // --- ATTRIBUTION STATS ---
      const clicks = clicksRes.count ?? 0
      const conversions = conversionsRes.count ?? 0
      const totalRevenue = (revenueRes.data || []).reduce((sum, a) => sum + (Number(a.revenue_usd) || 0), 0)

      // --- TOP KEYWORDS ---
      const kwMap: Record<string, { term: string; count: number }> = {}
      threads.forEach((t: any) => {
        const relation = Array.isArray(t.keywords) ? t.keywords[0] : t.keywords
        const term = relation?.term
        if (term) {
          kwMap[term] = kwMap[term] || { term, count: 0 }
          kwMap[term].count++
        }
      })
      const topKeywords = Object.values(kwMap).sort((a, b) => b.count - a.count).slice(0, 5)

      setData({
        stats: { found, drafted: draftedCount, sent: totalSent, sentThisMonth, sentLastMonth },
        trendData,
        activity: recentActivity,
        topKeywords,
        needsAttention: alerts,
        replyRate,
        platformData,
        highIntentThreshold,
        attributionStats: { clicks, conversions, totalRevenue }
      })
      hasLoadedDataRef.current = true
      setLoadFailed(false)
      } catch (error) {
        console.error('[analytics] Unable to load analytics', error)
        if (!hasLoadedDataRef.current) setLoadFailed(true)
      } finally {
        if (isInitialLoad) setLoading(false)
      }
    }, [supabase, userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    let refreshTimer: number | undefined
    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') return
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void loadData()
      }, 250)
    }

    const interval = window.setInterval(scheduleRefresh, 30_000)
    const channel = supabase
      .channel(`analytics-live-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monitored_threads', filter: `user_id=eq.${userId}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reply_analytics', filter: `user_id=eq.${userId}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draft_feedback', filter: `user_id=eq.${userId}` },
        scheduleRefresh,
      )
      .subscribe()

    window.addEventListener('focus', scheduleRefresh)
    document.addEventListener('visibilitychange', scheduleRefresh)

    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      window.clearInterval(interval)
      window.removeEventListener('focus', scheduleRefresh)
      document.removeEventListener('visibilitychange', scheduleRefresh)
      void supabase.removeChannel(channel)
    }
  }, [loadData, supabase, userId])

  if (loadFailed && !data) {
    return (
      <AppPage>
        <div className="w-full max-w-[1200px]">
          <h1 className="page-title">Analytics</h1>
          <DataLoadError
            title="Couldn’t load analytics"
            description="BuyerWatch couldn’t retrieve the reporting data. Check your connection and try again."
            onRetry={() => void loadData()}
          />
        </div>
      </AppPage>
    )
  }

  if (loading || !data) {
    return (
      <AppPage>
        <div className="space-y-6" aria-busy="true" aria-label="Loading analytics">
          <div className="space-y-2">
            <div className="h-8 w-36 animate-pulse rounded-md bg-[#E5E5E1]" />
            <div className="h-3 w-64 max-w-full animate-pulse rounded bg-[#EFEFED]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[16px] border border-black/[0.05] bg-white" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="h-[380px] animate-pulse rounded-[18px] border border-black/[0.05] bg-white lg:col-span-2" />
            <div className="h-[380px] animate-pulse rounded-[18px] border border-black/[0.05] bg-white" />
          </div>
        </div>
      </AppPage>
    )
  }

  const needsAttention = data.needsAttention
  const leadDiscoveryData = data.trendData.slice(-leadDiscoveryRange)
  const leadDiscoveryTotals = leadDiscoveryData.reduce(
    (totals, point) => ({
      discovered: totals.discovered + point.discovered,
      qualified: totals.qualified + point.qualified,
    }),
    { discovered: 0, qualified: 0 },
  )

  return (
    <AppPage>
      <div className="w-full max-w-[1200px] pb-12">
        <div className="mb-6">
          <h1 className="page-title">Analytics</h1>
        </div>

        <div className="flex flex-col gap-6">

          {/* ════════════════════ ROW 1 ════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Card: Lead Discovery */}
            <div className="relative flex flex-col overflow-hidden border border-black/[0.04] p-5 surface-ceramic sm:p-6 lg:col-span-2 lg:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                  <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Lead Discovery</h3>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-medium text-text-secondary">
                  <div className="inline-flex rounded-full bg-black/[0.04] p-0.5" aria-label="Lead discovery date range">
                    {LEAD_DISCOVERY_RANGES.map((range) => {
                      const active = leadDiscoveryRange === range
                      return (
                        <button
                          key={range}
                          type="button"
                          onClick={() => setLeadDiscoveryRange(range)}
                          aria-pressed={active}
                          className={
                            active
                              ? 'rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-colors'
                              : 'rounded-full px-2.5 py-1 text-[11px] font-semibold text-text-tertiary transition-colors hover:text-text-secondary'
                          }
                        >
                          {range}D
                        </button>
                      )
                    })}
                  </div>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#171717]" />
                    Discovered: <span className="font-bold text-text-primary">{leadDiscoveryTotals.discovered}</span>
                  </span>
                  <span className="text-text-tertiary hidden sm:inline">|</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0A84FF]" />
                    High-intent (≥{data.highIntentThreshold}%): <span className="font-bold text-[#0A84FF]">{leadDiscoveryTotals.qualified}</span>
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
                  <AreaChart data={leadDiscoveryData} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorDiscovered" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#171717" stopOpacity={0.05} />
                        <stop offset="95%" stopColor="#171717" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorQualified" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#0A84FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(20,18,16,0.045)" strokeDasharray="3 6" />
                    <XAxis
                      dataKey="date"
                      axisLine={false} tickLine={false}
                      tick={{ fill: 'rgba(20, 18, 16, 0.38)', fontSize: 11, fontWeight: 500 }}
                      minTickGap={30}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={28}
                      tick={{ fill: 'rgba(20, 18, 16, 0.28)', fontSize: 10, fontWeight: 600 }}
                      tickCount={3}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<LeadDiscoveryTooltip />}
                      cursor={{ stroke: 'rgba(10,132,255,0.16)', strokeWidth: 1 }}
                      wrapperStyle={{ outline: 'none' }}
                    />
                    <Area
                      type="linear"
                      dataKey="discovered"
                      stroke="#171717"
                      strokeWidth={1.75}
                      fillOpacity={1}
                      fill="url(#colorDiscovered)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#171717', stroke: '#fff', strokeWidth: 2 }}
                    />
                    <Area
                      type="linear"
                      dataKey="qualified"
                      stroke="#0A84FF"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorQualified)"
                      dot={false}
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
                          {event.type === 'sent' && <Send className="w-4 h-4 text-[#10B981]" />}
                          {(event.type === 'failed' || event.type === 'uncertain') && <AlertTriangle className={`w-4 h-4 ${event.type === 'failed' ? 'text-[#EF4444]' : 'text-[#F59E0B]'}`} />}
                          {event.type === 'cancelled' && <FileText className="w-4 h-4 text-[#F59E0B]" />}
                        </div>
                        <div className="flex-1 min-w-0 pt-1.5">
                          <p className="text-[13px] font-medium text-text-primary leading-snug truncate group-hover:text-clip group-hover:whitespace-normal transition-all">{event.label}</p>
                          {event.detail && <p className="mt-1 text-[11.5px] leading-4 text-text-secondary">{event.detail}</p>}
                          {event.actionHref && event.actionLabel && (
                            event.actionHref.startsWith('/') ? (
                              <Link href={event.actionHref} className="mt-1.5 inline-flex text-[11.5px] font-semibold text-[#0A84FF] hover:underline">{event.actionLabel}</Link>
                            ) : (
                              <a href={event.actionHref} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex text-[11.5px] font-semibold text-[#0A84FF] hover:underline">{event.actionLabel}</a>
                            )
                          )}
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
            <div className="relative flex flex-col overflow-hidden border border-black/[0.04] p-5 surface-ceramic sm:p-6 lg:p-8">
              <h2 className="text-[16px] font-semibold text-text-primary tracking-tight mb-8">Traffic by Platform</h2>
              {(data.platformData || []).some((p) => p.count > 0) ? (
                <>
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
                        <Bar dataKey="percentage" radius={[8, 8, 8, 8]} isAnimationActive={false}>
                          {(data.platformData || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                          <LabelList dataKey="percentage" content={(props: any) => <CustomBarLabel {...props} platformData={data.platformData || []} />} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-5 border-t border-black/[0.04] pt-6 sm:gap-8">
                    {(data.platformData || []).map((p, i) => (
                      <span key={i} className="flex items-center gap-2 text-[15px] text-text-primary font-medium">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.platform}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[260px] flex-1 items-center justify-center rounded-[22px] border border-black/[0.04] bg-white/60 text-center">
                  <div>
                    <p className="text-[14px] font-semibold text-text-primary">No platform traffic yet</p>
                    <p className="mt-1 text-[12.5px] text-text-tertiary">New monitored conversations will appear here automatically.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Middle Card: Reply Rate Gauge */}
            <div className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden border border-black/[0.04] p-5 surface-ceramic sm:p-6 lg:p-8">
              <div className="absolute inset-x-5 top-5 flex items-start justify-between sm:inset-x-6 sm:top-6">
                <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Reply Rate</h3>
              </div>
              <div className="mt-8 flex w-full justify-center">
                <RadialGauge percentage={data.replyRate} label="Drafted → Posted" />
              </div>
            </div>

            {/* Right Card: Needs Attention */}
            <div className="surface-ceramic border border-black/[0.04] overflow-hidden flex flex-col relative">
              <div className="px-6 pt-6 pb-4 border-b border-black/[0.04]">
                <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Needs Attention</h3>
              </div>
              <div className="flex-1 bg-white p-6">
                {needsAttention.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-[#10B981]/10 flex items-center justify-center mb-3">
                      <CheckCircle className="w-6 h-6 text-[#10B981]" strokeWidth={2.5} />
                    </div>
                    <p className="text-[14px] font-semibold text-text-primary">All caught up</p>
                    <p className="text-[13px] text-text-tertiary mt-1 max-w-[200px]">Nothing needs your attention right now.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {needsAttention.map(alert => (
                      <div key={alert.id} className="bg-surface border border-black/[0.06] rounded-[14px] p-4 flex flex-col shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                          <AlertTriangle className={`w-4 h-4 ${alert.type === 'error' ? 'text-[#EF4444]' : 'text-[#F59E0B]'}`} strokeWidth={2.5} />
                          <p className="text-[14px] font-semibold text-text-primary">{alert.label}</p>
                        </div>
                        {alert.onClick ? (
                          <button
                            type="button"
                            onClick={alert.onClick}
                            className="flex w-fit items-center gap-1 text-[13px] font-semibold text-[#0A84FF] transition-colors hover:text-[#0A84FF]/80"
                          >
                            {alert.actionLabel}
                          </button>
                        ) : (
                          <Link href={alert.href} className="text-[13px] font-semibold text-[#0A84FF] hover:text-[#0A84FF]/80 flex items-center gap-1 transition-colors w-fit">
                            {alert.actionLabel}
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Feature 2: Attribution Pipeline Card (Positioned at bottom) */}
          <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] sm:p-6">
            <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-[16px] font-bold text-gray-900 tracking-tight">Attribution Pipeline</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Track replies that generated a verified click, conversion, or payment.</p>
              </div>
              <Link href="/settings#notifications" className="text-xs font-semibold text-[#0A84FF] hover:underline">
                Setup Conversion Webhook →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-[14px] border border-[#E3E3E0] bg-white p-5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Replies Clicked</p>
                <p className="text-3xl font-extrabold text-gray-900 tracking-tight">{data.attributionStats?.clicks || 0}</p>
                <p className="text-xs text-gray-500 mt-1.5 font-medium">Tracked replies with at least one verified click</p>
              </div>
              <div className="rounded-[14px] border border-[#E3E3E0] bg-white p-5">
                <p className="text-[11px] font-bold text-blue-600/80 uppercase tracking-wider mb-1">Conversions</p>
                <p className="text-3xl font-extrabold text-[#0A84FF] tracking-tight">{data.attributionStats?.conversions || 0}</p>
                <p className="text-xs text-gray-600 mt-1.5 font-medium">Attributed signups / payments</p>
              </div>
              <div className="rounded-[14px] border border-[#E3E3E0] bg-white p-5">
                <p className="text-[11px] font-bold text-emerald-600/80 uppercase tracking-wider mb-1">Attributed Revenue</p>
                <p className="text-3xl font-extrabold text-emerald-600 tracking-tight">
                  {'$' + (data.attributionStats?.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-600 mt-1.5 font-medium">Total revenue generated</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppPage>
  )
}
