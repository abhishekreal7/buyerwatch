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
import { formatDistanceToNow, subDays, format } from 'date-fns'
import { useDashboardSession } from '@/components/DashboardContext'
import { fetchAllByKey } from '@/lib/supabase-pagination'
import { normalizeHighIntentThreshold } from '@/lib/high-intent-threshold'
import { DataLoadError } from '@/components/DataLoadError'
import { canMonitorPlatform } from '@/lib/plan-limits'
import { getEntitledPlan } from '@/lib/billing-entitlements'
import { buildRollingTrendBuckets, compareTrendCounts, type TrendComparison } from '@/lib/analytics-trends'

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

function TrendComparisonBadge({ metric, comparison }: { metric: string; comparison: TrendComparison }) {
  const tone = comparison.direction === 'higher' || comparison.direction === 'new'
    ? 'bg-emerald-50 text-emerald-700'
    : comparison.direction === 'lower'
      ? 'bg-rose-50 text-rose-700'
      : 'bg-black/[0.04] text-text-tertiary'

  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-1 text-[10.5px] font-semibold ${tone}`}
      title={`${metric}: ${comparison.current.toLocaleString('en-US')} in the current period; ${comparison.preceding.toLocaleString('en-US')} in the preceding period.`}
      aria-label={`${metric}. ${comparison.label}`}
    >
      {comparison.label}
    </span>
  )
}

function normalizePlatform(value: unknown) {
  const platform = String(value || '').trim().toLowerCase()
  if (platform === 'twitter' || platform === 'x.com') return 'x'
  if (platform === 'reddit.com') return 'reddit'
  if (platform === 'bsky' || platform === 'bsky.app') return 'bluesky'
  return platform
}

// Custom Tooltip for Lead Discovery Chart
const LeadDiscoveryTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
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
    stats: { found: number, highIntent: number, drafted: number, sent: number, sentThisMonth: number, sentLastMonth: number }
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
    replyOutcomes: {
      deliverySuccessRate: number | null
      conversationsStarted: number
      repliesReceived: number
      conversationResponseRate: number | null
      verifiedRepliesChecked: number
    }
    platformData: any[]
    highIntentThreshold: number
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
        generatedDraftsRes,
        sentThisMonthRes,
        sentLastMonthRes,
        feedbackRes,
        deliveryActivityRes,
        replyOutcomesRes,
      ] = await Promise.all([
        supabase.from('profiles').select('plan, billing_status, billing_subscription_id, auto_send_enabled, high_intent_threshold').eq('id', userId).single(),
        supabase.from('platform_connections').select('platform').eq('user_id', userId),
        fetchAllByKey(
          (afterId, limit) => {
            let query = supabase
              .from('monitored_threads')
              .select('id, status, platform, intent_score, created_at, author, keywords(term)')
              .eq('user_id', userId)
              .not('intent_score', 'is', null)
              .order('id', { ascending: true })
              .limit(limit)
            if (afterId) query = query.gt('id', afterId)
            return query
          },
          row => row.id,
        ),
        supabase.from('reply_analytics').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('was_sent', true).not('sent_at', 'is', null),
        supabase.from('reply_analytics').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('draft_text', 'is', null),
        supabase.from('reply_analytics').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('was_sent', true).gte('sent_at', thirtyDaysAgoIso),
        supabase.from('reply_analytics').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('was_sent', true).gte('sent_at', sixtyDaysAgoIso).lt('sent_at', thirtyDaysAgoIso),
        supabase.from('draft_feedback').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        fetch('/api/replies/activity', { cache: 'no-store' }),
        fetch('/api/replies/outcomes', { cache: 'no-store' }),
      ])

      const queryError = [
        profileRes,
        connsRes,
        threadsRes,
        totalSentRes,
        generatedDraftsRes,
        sentThisMonthRes,
        sentLastMonthRes,
        feedbackRes,
      ].find(result => result.error)?.error
      if (queryError) throw queryError
      if (!deliveryActivityRes.ok) throw new Error('delivery_activity_load_failed')
      if (!replyOutcomesRes.ok) throw new Error('reply_outcomes_load_failed')

      const threads = threadsRes.data || []
      const feedback = feedbackRes.data || []
      const conns = connsRes.data || []
      const profile = profileRes.data
      const highIntentThreshold = normalizeHighIntentThreshold(profile?.high_intent_threshold)
      const xAllowed = canMonitorPlatform(getEntitledPlan(profile), 'x')

      // --- STATS ---
      const found = threads.length
      const draftedThreads = threads.filter(t => t.status === 'drafted' || t.status === 'needs_manual_reply')
      const draftedCount = draftedThreads.length

      const totalSent = totalSentRes.count ?? 0
      const generatedDrafts = generatedDraftsRes.count ?? 0
      const sentThisMonth = sentThisMonthRes.count ?? 0
      const sentLastMonth = sentLastMonthRes.count ?? 0
      const highIntentCount = threads.filter(thread => Number(thread.intent_score) >= highIntentThreshold).length

      // Exact rolling 24-hour buckets keep current and preceding periods equal in duration.
      const trendData = buildRollingTrendBuckets(
        threads.map(thread => ({
          createdAt: thread.created_at,
          qualified: Number(thread.intent_score) >= highIntentThreshold,
        })),
        now,
      ).map(bucket => ({
        date: format(bucket.end, 'MMM d'),
        discovered: bucket.discovered,
        qualified: bucket.qualified,
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
      const replyOutcomes = await replyOutcomesRes.json() as {
        deliverySuccessRate?: number | null
        conversationsStarted?: number
        repliesReceived?: number
        conversationResponseRate?: number | null
        verifiedRepliesChecked?: number
      }
      const deliveryActivity = deliveryPayload.activity ?? []
      // A completed send belongs in the history. Anything that was stopped,
      // failed, or could not be confirmed is an unresolved task, so it is
      // deliberately kept out of the quiet activity timeline below.
      for (const item of deliveryActivity.filter(item => item.state === 'sent')) {
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

      // --- PLATFORM TRAFFIC ---
      const platformCounts: Record<string, number> = { reddit: 0, bluesky: 0, x: 0 }
      threads.forEach(t => {
        if (t.status === 'dismissed') return
        const platform = normalizePlatform(t.platform)
        if (platform in platformCounts && (platform !== 'x' || xAllowed)) platformCounts[platform] += 1
      })
      const totalPlatforms = Object.values(platformCounts).reduce((sum, count) => sum + count, 0)
      const primaryPlatform = Object.entries(platformCounts)
        .sort(([, left], [, right]) => right - left)[0]?.[0]
      const platformData = (Object.keys(platformCounts) as Array<keyof typeof platformCounts>)
        .filter(platform => platform !== 'x' || xAllowed)
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
      const alerts: Array<{
        id: string
        type: 'warning' | 'error'
        label: string
        detail?: string
        actionLabel: string
        href: string
      }> = deliveryActivity
        .filter(item => item.state === 'failed' || item.state === 'uncertain' || item.state === 'cancelled')
        .map(item => ({
          id: `delivery-${item.threadId}-${item.state}`,
          type: item.state === 'failed' ? 'error' : 'warning',
          label: item.title,
          detail: item.message,
          actionLabel: item.actionLabel,
          href: item.actionHref,
        }))
      if (draftedCount > 0) {
        alerts.push({ id: 'drafts', type: 'warning', label: `${draftedCount} drafts ready for review`, actionLabel: 'Take action →', href: '/dashboard' })
      }
      if (threads.some(thread => thread.platform === 'reddit') && !conns.some(c => c.platform === 'reddit')) {
        alerts.push({ id: 'reddit_api', type: 'warning', label: 'Reddit not connected', actionLabel: 'Connect Reddit →', href: '/settings' })
      }
      if (profile && !profile.auto_send_enabled) {
        alerts.push({ id: 'autosend', type: 'warning', label: 'Auto-send paused', actionLabel: 'Resume →', href: '/settings' })
      }

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
        stats: { found, highIntent: highIntentCount, drafted: generatedDrafts, sent: totalSent, sentThisMonth, sentLastMonth },
        trendData,
        activity: recentActivity,
        topKeywords,
        needsAttention: alerts,
        replyOutcomes: {
          deliverySuccessRate: Number.isFinite(replyOutcomes.deliverySuccessRate)
            ? Number(replyOutcomes.deliverySuccessRate)
            : null,
          conversationsStarted: Math.max(0, Math.floor(Number(replyOutcomes.conversationsStarted) || 0)),
          repliesReceived: Math.max(0, Math.floor(Number(replyOutcomes.repliesReceived) || 0)),
          conversationResponseRate: Number.isFinite(replyOutcomes.conversationResponseRate)
            ? Number(replyOutcomes.conversationResponseRate)
            : null,
          verifiedRepliesChecked: Math.max(0, Math.floor(Number(replyOutcomes.verifiedRepliesChecked) || 0)),
        },
        platformData,
        highIntentThreshold,
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
  const previousLeadDiscoveryData = data.trendData.slice(-(leadDiscoveryRange * 2), -leadDiscoveryRange)
  const previousLeadDiscoveryTotals = previousLeadDiscoveryData.reduce(
    (totals, point) => ({
      discovered: totals.discovered + point.discovered,
      qualified: totals.qualified + point.qualified,
    }),
    { discovered: 0, qualified: 0 },
  )
  const leadDiscoveryComparison = compareTrendCounts(
    leadDiscoveryTotals.discovered + leadDiscoveryTotals.qualified,
    previousLeadDiscoveryTotals.discovered + previousLeadDiscoveryTotals.qualified,
    leadDiscoveryRange,
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
              <div className="mb-6">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-[16px] font-semibold tracking-tight text-text-primary">Lead Discovery</h3>
                  <div className="inline-flex shrink-0 rounded-full bg-black/[0.04] p-0.5" aria-label="Lead discovery date range">
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
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-medium text-text-secondary">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="h-2 w-2 rounded-full bg-[#171717]" />
                    Discovered <span className="font-bold text-text-primary">{leadDiscoveryTotals.discovered}</span>
                  </span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="h-2 w-2 rounded-full bg-[#0A84FF]" />
                    High-intent <span className="font-bold text-[#0A84FF]">{leadDiscoveryTotals.qualified}</span>
                  </span>
                  <TrendComparisonBadge metric="Lead discovery" comparison={leadDiscoveryComparison} />
                </div>
              </div>

              <div className="flex-1 mt-2 h-[176px] -ml-2 relative z-10">
                {data.stats.found === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/75 backdrop-blur-[0.5px] z-20">
                    <p className="mb-1.5 text-[15px] font-semibold leading-5 tracking-[-0.01em] text-text-primary">No leads discovered yet</p>
                    <p className="max-w-[320px] text-center text-[13px] font-normal leading-5 text-text-secondary">
                      Create your first keyword rule in <Link href="/keywords" className="font-semibold text-[#0A84FF] underline-offset-2 hover:underline">Keywords</Link> to start monitoring.
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
                      <filter id="leadDiscoveryGlow" x="-20%" y="-25%" width="140%" height="150%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="1.7" result="blur" />
                        <feFlood floodColor="#0A84FF" floodOpacity="0.26" result="glowColor" />
                        <feComposite in="glowColor" in2="blur" operator="in" result="glow" />
                        <feMerge>
                          <feMergeNode in="glow" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
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
                      filter="url(#leadDiscoveryGlow)"
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

            {/* Middle Card: Reply outcomes */}
            <div className="relative flex min-h-[360px] flex-col items-center justify-center overflow-hidden border border-black/[0.04] p-5 surface-ceramic sm:p-6 lg:p-8">
              <div className="absolute inset-x-5 top-5 flex items-start justify-between sm:inset-x-6 sm:top-6">
                <h3 className="text-[16px] font-semibold text-text-primary tracking-tight">Reply outcomes</h3>
              </div>
              <div className="mt-10 flex w-full justify-center">
                <RadialGauge
                  percentage={data.replyOutcomes.conversationResponseRate}
                  label={data.replyOutcomes.verifiedRepliesChecked > 0 ? 'Conversation response rate' : 'Waiting for verified checks'}
                />
              </div>
              <p className="-mt-1 max-w-[250px] text-center text-[11px] leading-4 text-text-tertiary">
                {data.replyOutcomes.verifiedRepliesChecked > 0
                  ? `Based on ${data.replyOutcomes.verifiedRepliesChecked} verified ${data.replyOutcomes.verifiedRepliesChecked === 1 ? 'posted reply' : 'posted replies'}.`
                  : 'This rate appears after BuyerWatch verifies a posted reply.'}
              </p>
              <div className="mt-1 grid w-full grid-cols-2 divide-x divide-black/[0.06] border-t border-black/[0.06] pt-4 text-center">
                <div className="px-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary">Replies received</p>
                  <p className="mt-1 text-[20px] font-bold tracking-tight text-text-primary">
                    {data.replyOutcomes.repliesReceived}
                  </p>
                </div>
                <div className="px-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary">Delivery reliability</p>
                  <p className="mt-1 text-[20px] font-bold tracking-tight text-text-primary">
                    {data.replyOutcomes.deliverySuccessRate === null
                      ? '—'
                      : `${Math.round(data.replyOutcomes.deliverySuccessRate)}%`}
                  </p>
                </div>
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
                        {alert.detail && (
                          <p className="mb-3 text-[12.5px] leading-5 text-text-secondary">{alert.detail}</p>
                        )}
                        {alert.href.startsWith('/') ? (
                          <Link href={alert.href} className="text-[13px] font-semibold text-[#0A84FF] hover:text-[#0A84FF]/80 flex items-center gap-1 transition-colors w-fit">
                            {alert.actionLabel}
                          </Link>
                        ) : (
                          <a href={alert.href} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-[#0A84FF] hover:text-[#0A84FF]/80 flex items-center gap-1 transition-colors w-fit">
                            {alert.actionLabel}
                          </a>
                        )}
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
