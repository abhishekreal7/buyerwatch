'use client'

import { useCallback, useDeferredValue, useEffect, useState } from 'react'
import {
  Search,
  Target,
  MessageCircle,
  ExternalLink,
  X,
  RefreshCcw,
  Copy,
  FileText,
  Sparkles,
  Globe,
  CalendarDays,
  ChevronDown,
  ArrowUp,
  AlertTriangle,
  Send,
  Edit3,
  Check,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import { toast } from 'sonner'
import { UpgradeModal } from '@/components/UpgradeModal'
import { GettingStartedChecklist } from '@/components/GettingStartedChecklist'
import { BlueskyIcon, RedditIcon, XIcon } from '@/components/Icons'
import { PageHeader } from '@/components/PageHeader'
import { PLAN_POLL_INTERVAL_MINUTES, normalizePlan, type PlanTier } from '@/lib/plan-limits'
import {
  BILLING_ADDONS,
  getCurrentUsageMonth,
  getPlanLimitsWithAddons,
  sumMonthlyAddonCredits,
  type BillingAddonType,
} from '@/lib/billing-addons'
import { useDashboardSession } from '@/components/DashboardContext'
import { getIntentDisplayLabel, isLowRelevanceScore, type IntentLabel } from '@/lib/intent'
import { getSafeThreadUrl } from '@/lib/thread-url'
import { IntentBadge } from '@/components/IntentBadge'
import { waitForReplyDelivery, type ReplySendResult } from '@/lib/reply-send-client'
import { copyAndOpenRedditReply } from '@/lib/reddit-handoff-client'
import {
  DEFAULT_HIGH_INTENT_THRESHOLD,
  normalizeHighIntentThreshold,
} from '@/lib/high-intent-threshold'
import {
  DASHBOARD_METRIC_PERIODS,
  getDashboardMetricPeriodLabel,
  getDashboardMetricPeriodStart,
  isDashboardMetricPeriod,
  type DashboardMetricPeriod,
} from '@/lib/dashboard-metric-period'
import { useConversationSearch } from '@/lib/conversation-search'
import { RedditCommunityPolicyNotice } from '@/components/RedditCommunityPolicyNotice'
import { DataLoadError } from '@/components/DataLoadError'
import { summarizeKeywordPollHealth } from '@/lib/monitoring-health'
import { trackEvent } from '@/lib/analytics'

interface Thread {
  id: string
  platform: string
  target: string
  timeAgo: string
  title: string
  content: string
  score: number | null
  label: string
  matchedKeyword: string
  draft: string
  originalDraft: string
  url: string | null
  flag?: string
  reasoning?: string
  googleRanked?: boolean
  createdAt: string
  status: string
  reviewedAt: string | null
}

type FilterTab = 'all' | 'high-intent' | 'dismissed'

const DASHBOARD_FILTER_STORAGE_KEY = 'buyerwatch:dashboard-filter-tab'

function isFilterTab(value: string | null): value is FilterTab {
  return value === 'all' || value === 'high-intent' || value === 'dismissed'
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function getWindowHoursLeft(createdAt: string): number | null {
  const WINDOW_HOURS = 24
  const created = new Date(createdAt)
  const now = new Date()
  const hoursElapsed = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
  const hoursLeft = WINDOW_HOURS - hoursElapsed
  if (hoursLeft <= 0) return null
  return Math.floor(hoursLeft)
}

function getDeliveryActionLabel(platform: string) {
  if (platform === 'reddit') {
    return 'Copy & Open Reddit'
  }
  if (platform === 'bluesky') return 'Post through Bluesky'
  return 'Review delivery'
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const cls = className || 'h-4 w-4 shrink-0'
  const norm = platform.toLowerCase()
  if (norm === 'reddit') return <RedditIcon className={`${cls} text-[#FF4500]`} />
  if (norm === 'bluesky') return <BlueskyIcon className={`${cls} text-[#1185FE]`} />
  if (norm === 'x') return <XIcon className={`${cls} text-[#0F1419]`} />
  return <MessageCircle className={`${cls} text-gray-500`} />
}

function mapThread(thread: any): Thread {
  const sourceCreatedAt = thread.source_created_at || thread.created_at
  const score = thread.intent_score === null || thread.intent_score === undefined
    ? null
    : Number(thread.intent_score)

  return {
    id: thread.id,
    platform: thread.platform,
    target: (thread.keywords as { target?: string } | null)?.target || thread.platform,
    timeAgo: formatTimeAgo(sourceCreatedAt),
    title: thread.title || '',
    content: thread.text_content || '',
    score,
    label: score === null
      ? 'Awaiting analysis'
      : getIntentDisplayLabel(
        thread.intent_label as IntentLabel | undefined,
        score,
      ),
    matchedKeyword: (thread.keywords as { term?: string } | null)?.term || '',
    draft: (thread.reply_analytics as { draft_text?: string }[])?.[0]?.draft_text || '',
    originalDraft: (thread.reply_analytics as { draft_text?: string }[])?.[0]?.draft_text || '',
    url: thread.url || null,
    flag: thread.flag || undefined,
    reasoning: thread.score_reasoning || undefined,
    googleRanked: thread.google_rank_position > 0,
    createdAt: sourceCreatedAt,
    status: thread.status || 'pending',
    reviewedAt: thread.reviewed_at || null,
  }
}

// ─── Stat Card Component (Clean, Unified) ──────────────────────────────────────

function MetricCard({
  label,
  value,
  period,
  badge,
  actionLink,
  icon: Icon,
  loading,
}: {
  label: string
  value: number | string
  period?: string
  badge?: React.ReactNode
  actionLink?: { label: string; href: string }
  icon: React.ElementType
  loading: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-xs flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        </div>
        <div className="flex items-baseline gap-2.5">
          <p className="text-[26px] font-bold text-gray-900 tabular-nums leading-none">
            {loading ? <span className="text-gray-300">—</span> : value}
          </p>
          {badge}
        </div>
        {period && (
          <p className="text-[11px] text-gray-400 mt-1.5 font-medium">{period}</p>
        )}
        {actionLink && (
          <a
            href={actionLink.href}
            className="inline-block text-[11.5px] font-semibold text-[#0A84FF] hover:underline mt-1.5"
          >
            {actionLink.label}
          </a>
        )}
      </div>
      <div className="h-10 w-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-gray-400" />
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [totalSent, setTotalSent] = useState(0)
  const [plan, setPlan] = useState<PlanTier>('free')
  const [regenerating, setRegenerating] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('high-intent')
  const [filterPreferenceReady, setFilterPreferenceReady] = useState(false)
  const [metricsPeriod, setMetricsPeriod] = useState<DashboardMetricPeriod>('7d')
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [showLowRelevance, setShowLowRelevance] = useState(false)
  const { conversationSearch: searchQuery } = useConversationSearch()
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [searchLoading, setSearchLoading] = useState(false)
  const [communityHealth, setCommunityHealth] = useState<Record<string, { rejection_rate: number; total_engagements: number }>>({})
  const [editingDraft, setEditingDraft] = useState<string | null>(null)
  const [stats, setStats] = useState({
    threadsFound: 0,
    highIntent: 0,
    highIntentToday: 0,
    draftsReady: 0,
    repliesSent: 0,
  })
  const [keywordsCount, setKeywordsCount] = useState(0)
  const [keywordsMax, setKeywordsMax] = useState(1)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [hasInspectedLead, setHasInspectedLead] = useState(false)
  const [hasCopiedOrApproved, setHasCopiedOrApproved] = useState(false)
  const [autoSendEnabled, setAutoSendEnabled] = useState(false)
  const [highIntentThreshold, setHighIntentThreshold] = useState(DEFAULT_HIGH_INTENT_THRESHOLD)
  const [sendingThreadId, setSendingThreadId] = useState<string | null>(null)
  const [checkingNow, setCheckingNow] = useState(false)
  const [pollHealth, setPollHealth] = useState({
    lastAttemptAt: null as string | null,
    lastSuccessfulAt: null as string | null,
    delayedRules: 0,
    activeRules: 0,
  })
  const [signalUsage, setSignalUsage] = useState({ used: 0, limit: 250 })
  const [draftUsage, setDraftUsage] = useState({ used: 0, limit: 40 })
  const [openingAddonCheckout, setOpeningAddonCheckout] = useState<BillingAddonType | null>(null)
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()

  useEffect(() => {
    try {
      const savedFilterTab = window.localStorage.getItem(DASHBOARD_FILTER_STORAGE_KEY)
      if (isFilterTab(savedFilterTab)) setFilterTab(savedFilterTab)
    } catch {
      // Ignored
    } finally {
      setFilterPreferenceReady(true)
    }
  }, [])

  useEffect(() => {
    if (!filterPreferenceReady) return
    try {
      window.localStorage.setItem(DASHBOARD_FILTER_STORAGE_KEY, filterTab)
    } catch {
      // Ignored
    }
  }, [filterPreferenceReady, filterTab])

  const loadData = useCallback(async () => {
    const periodStart = getDashboardMetricPeriodStart(metricsPeriod)
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayIso = today.toISOString()
      const usageMonth = getCurrentUsageMonth()
      const profileResultPromise = supabase
        .from('profiles')
        .select('plan, auto_send_enabled, signal_count, signal_month, draft_count, draft_month, high_intent_threshold')
        .eq('id', userId)
        .single()
      const independentResultsPromise = Promise.all([
        supabase
          .from('billing_addon_credits')
          .select('addon_type, credits')
          .eq('user_id', userId)
          .eq('usage_month', usageMonth),
        supabase
          .from('keywords')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('keywords')
          .select('last_checked_at, last_success_at, last_check_status')
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase
          .from('draft_feedback')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('action_type', ['COPIED', 'APPROVED', 'EDITED_APPROVED', 'AUTO_SENT']),
        supabase
          .from('monitored_threads')
          .select('*, reply_analytics(draft_text), keywords(term, target)')
          .eq('user_id', userId)
          .in('status', ['pending', 'drafted', 'needs_manual_reply'])
          .not('intent_score', 'is', null)
          .order('source_created_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('monitored_threads')
          .select('*, reply_analytics(draft_text), keywords(term, target)')
          .eq('user_id', userId)
          .eq('status', 'dismissed')
          .not('intent_score', 'is', null)
          .order('source_created_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(60),
      ])

      const profileResult = await profileResultPromise
      const profile = profileResult.data
      const effectiveHighIntentThreshold = normalizeHighIntentThreshold(
        profile?.high_intent_threshold,
      )
      const [
        addonCreditsResult,
        keywordsCountResult,
        keywordHealthResult,
        feedbackCountResult,
        activeThreadsResult,
        dismissedThreadsResult,
      ] = await independentResultsPromise
      const initialQueryError = [
        profileResult,
        addonCreditsResult,
        keywordsCountResult,
        keywordHealthResult,
        feedbackCountResult,
        activeThreadsResult,
        dismissedThreadsResult,
      ].find(result => result.error)?.error
      if (initialQueryError) throw initialQueryError

      let threadsFoundCountQuery = supabase
        .from('monitored_threads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('intent_score', 'is', null)
      let highIntentCountQuery = supabase
        .from('monitored_threads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('intent_score', 'is', null)
        .gte('intent_score', effectiveHighIntentThreshold)
      let repliesSentCountQuery = supabase
        .from('reply_analytics')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('was_sent', true)

      if (periodStart) {
        threadsFoundCountQuery = threadsFoundCountQuery.gte('source_created_at', periodStart)
        highIntentCountQuery = highIntentCountQuery.gte('source_created_at', periodStart)
        repliesSentCountQuery = repliesSentCountQuery.gte('sent_at', periodStart)
      }

      const [
        threadsFoundCountResult,
        highIntentCountResult,
        draftsCountResult,
        repliesSentCountResult,
        totalPostedCountResult,
        highIntentTodayCountResult,
      ] = await Promise.all([
        threadsFoundCountQuery,
        highIntentCountQuery,
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', ['drafted', 'needs_manual_reply']),
        repliesSentCountQuery,
        supabase
          .from('reply_analytics')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('was_sent', true),
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .not('intent_score', 'is', null)
          .gte('intent_score', effectiveHighIntentThreshold)
          .gte('source_created_at', todayIso),
      ])
      const metricsQueryError = [
        threadsFoundCountResult,
        highIntentCountResult,
        draftsCountResult,
        repliesSentCountResult,
        totalPostedCountResult,
        highIntentTodayCountResult,
      ].find(result => result.error)?.error
      if (metricsQueryError) throw metricsQueryError

      const normalizedPlan = normalizePlan(profile?.plan)
      const addonCredits = sumMonthlyAddonCredits(addonCreditsResult.data)
      const effectiveLimits = getPlanLimitsWithAddons(normalizedPlan, addonCredits)
      setPlan(normalizedPlan)
      setKeywordsMax(effectiveLimits.keywords)
      setSignalUsage({
        used: profile?.signal_month === usageMonth ? Math.max(profile.signal_count ?? 0, 0) : 0,
        limit: effectiveLimits.threadsPerMonth,
      })
      setDraftUsage({
        used: profile?.draft_month === usageMonth ? Math.max(profile.draft_count ?? 0, 0) : 0,
        limit: effectiveLimits.aiDraftsPerMonth,
      })
      setAutoSendEnabled(profile?.auto_send_enabled ?? false)
      setHighIntentThreshold(effectiveHighIntentThreshold)

      setKeywordsCount(keywordsCountResult.count ?? 0)
      const keywordHealthRows = keywordHealthResult.data ?? []
      const staleAfterMs = (
        PLAN_POLL_INTERVAL_MINUTES[normalizedPlan] * 3 + 10
      ) * 60_000
      setPollHealth(summarizeKeywordPollHealth(keywordHealthRows, staleAfterMs))
      setHasCopiedOrApproved((feedbackCountResult.count ?? 0) > 0)

      const threadData = [
        ...(activeThreadsResult.data ?? []),
        ...(dismissedThreadsResult.data ?? []),
      ].sort((left, right) => (
        Date.parse(right.source_created_at || right.created_at)
        - Date.parse(left.source_created_at || left.created_at)
      ))

      const parsed = (threadData || []).map(mapThread)

      setThreads(parsed)
      setHasInspectedLead(parsed.some(thread => Boolean(thread.reviewedAt)))
      const activeParsed = parsed.filter(t => t.status !== 'dismissed')
      const requestedThreadId = new URLSearchParams(window.location.search).get('thread')
      const requestedThread = requestedThreadId
        ? parsed.find(thread => thread.id === requestedThreadId)
        : null
      if (requestedThread) {
        setFilterTab(requestedThread.status === 'dismissed' ? 'dismissed' : 'all')
        setSelectedThread(requestedThread)
        setHasInspectedLead(true)
      } else {
        setSelectedThread(current => {
          const refreshedSelection = current
            ? parsed.find(thread => thread.id === current.id)
            : null
          return refreshedSelection ?? activeParsed[0] ?? null
        })
      }

      const targets = [...new Set((threadData || []).map((t: any) => (t.keywords as any)?.target).filter(Boolean))]
      if (targets.length > 0) {
        const { data: healthData } = await supabase
          .from('community_trust_metrics')
          .select('target_community, rejection_rate, total_engagements')
          .in('target_community', targets)
        if (healthData) {
          const healthMap: Record<string, { rejection_rate: number; total_engagements: number }> = {}
          healthData.forEach((h: any) => { healthMap[h.target_community] = { rejection_rate: Number(h.rejection_rate), total_engagements: h.total_engagements } })
          setCommunityHealth(healthMap)
        }
      }

      const totalPosted = totalPostedCountResult.count ?? 0
      setTotalSent(totalPosted)
      setStats({
        threadsFound: threadsFoundCountResult.count ?? 0,
        highIntent: highIntentCountResult.count ?? 0,
        highIntentToday: highIntentTodayCountResult.count ?? 0,
        draftsReady: draftsCountResult.count ?? 0,
        repliesSent: repliesSentCountResult.count ?? 0,
      })
      setMetricsLoading(false)
      setLoadFailed(false)
    } catch (error) {
      console.error('[dashboard] Failed to load dashboard data', error)
      setLoadFailed(true)
      toast.error('Failed to load dashboard data')
    } finally {
      setMetricsLoading(false)
      setLoading(false)
    }
  }, [metricsPeriod, supabase, userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const normalizedQuery = deferredSearchQuery.trim()

    if (!normalizedQuery) {
      setSearchLoading(false)
      return
    }

    const controller = new AbortController()
    setSearchLoading(true)
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: normalizedQuery,
          tab: filterTab,
          threshold: String(highIntentThreshold),
        })
        const response = await fetch(`/api/conversations/search?${params}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('search_failed')
        const data = await response.json() as { threads?: unknown[] }
        if (!controller.signal.aborted) {
          setThreads((data.threads ?? []).map(mapThread))
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[dashboard] Conversation search failed', error)
          toast.error('Search failed. Please try again.')
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [deferredSearchQuery, filterTab, highIntentThreshold])

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
      .channel(`dashboard-live-${userId}`)
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
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
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

  const handleInspectThread = async (thread: Thread) => {
    setSelectedThread(thread)
    setHasInspectedLead(true)
    if (thread.reviewedAt || !userId) return

    const reviewedAt = new Date().toISOString()
    setThreads(prev => prev.map(item => item.id === thread.id ? { ...item, reviewedAt } : item))
    setSelectedThread(prev => prev?.id === thread.id ? { ...prev, reviewedAt } : prev)
    try {
      const { error } = await supabase.rpc('mark_thread_reviewed', {
        p_user_id: userId,
        p_thread_id: thread.id,
      })
      if (error) throw error
    } catch (error) {
      console.error('[dashboard] Unable to mark conversation reviewed', error)
      setThreads(prev => prev.map(item => item.id === thread.id ? { ...item, reviewedAt: null } : item))
      setSelectedThread(prev => prev?.id === thread.id ? { ...prev, reviewedAt: null } : prev)
      setHasInspectedLead(threads.some(item => Boolean(item.reviewedAt)))
    }
  }

  const handleApproveAndSend = async (threadToApprove?: Thread) => {
    const thread = threadToApprove || selectedThread
    if (!thread || !thread.draft || sendingThreadId) return
    setSendingThreadId(thread.id)
    try {
      const res = await fetch('/api/replies/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          text: thread.draft,
          platform: thread.platform,
        })
      })
      const payload = await res.json().catch(() => null) as (ReplySendResult & { error?: string; message?: string }) | null
      if (!res.ok || !payload) throw new Error(payload?.message || payload?.error || 'Failed to dispatch reply')

      if (payload.mode === 'manual') {
        await copyAndOpenRedditReply({
          text: payload.text,
          postUrl: payload.postUrl,
        })
        setHasCopiedOrApproved(true)
        toast.success('Reply copied. Post it on Reddit, then click Mark as Posted.')
        return
      }

      const actionType = thread.originalDraft === thread.draft
        ? 'APPROVED'
        : 'EDITED_APPROVED'
      const feedbackResponse = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          originalDraft: thread.originalDraft,
          finalDraft: thread.draft,
          actionType,
          platform: thread.platform,
          targetCommunity: thread.target,
          keywordCluster: thread.matchedKeyword,
        }),
      })
      if (!feedbackResponse.ok) {
        toast.warning('Reply is posting, but review history could not be updated.')
      } else {
        setHasCopiedOrApproved(true)
      }
      toast.info('Posting reply...')
      await waitForReplyDelivery(thread.id)
      clearSupabaseReadCache()
      trackEvent('reply_posted', {
        thread_id: thread.id,
        platform: thread.platform,
        target: thread.target,
        is_edited: thread.originalDraft !== thread.draft,
      })
      setThreads(prev => prev.filter(item => item.id !== thread.id))
      setSelectedThread(current => current?.id === thread.id
        ? threads.find(item => item.id !== thread.id) || null
        : current)
      setEditingDraft(null)
      setTotalSent(prev => prev + 1)
      setStats(prev => ({ ...prev, repliesSent: prev.repliesSent + 1 }))
      void loadData()
      toast.success(totalSent === 0 ? 'First reply posted successfully.' : 'Reply posted successfully.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reply')
    } finally {
      setSendingThreadId(null)
    }
  }

  const handleCopyDraft = async (threadToCopy?: Thread) => {
    const thread = threadToCopy || selectedThread
    if (!thread?.draft) return
    try {
      await navigator.clipboard.writeText(thread.draft)
      trackEvent('reply_copied', {
        thread_id: thread.id,
        platform: thread.platform,
        target: thread.target,
      })
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy the draft')
      return
    }

    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: thread.id,
        originalDraft: thread.originalDraft,
        finalDraft: thread.draft,
        actionType: 'COPIED',
        platform: thread.platform,
        targetCommunity: thread.target,
        keywordCluster: thread.matchedKeyword,
      }),
    }).catch(() => null)
    if (response?.ok) setHasCopiedOrApproved(true)
  }

  const handleDismiss = useCallback(async (threadIdToDismiss?: string) => {
    const targetId = threadIdToDismiss ?? selectedThread?.id
    if (!targetId) return
    const dismissed = threads.find(t => t.id === targetId)
    if (!dismissed || dismissed.status === 'dismissed') return

    try {
      const { error } = await supabase.rpc('dismiss_thread', { p_thread_id: targetId })
      if (error) throw error
      trackEvent('reply_dismissed', {
        thread_id: targetId,
        platform: dismissed.platform,
        target: dismissed.target,
      })
    } catch (error) {
      console.error('[dashboard] Unable to dismiss conversation', error)
      toast.error('Could not dismiss this conversation. Nothing was changed.')
      return
    }

    setThreads(prev => prev.map(thread => (
      thread.id === targetId ? { ...thread, status: 'dismissed' } : thread
    )))
    if (selectedThread?.id === targetId) {
      setSelectedThread(
        threads.find(thread => thread.id !== targetId && thread.status !== 'dismissed') || null,
      )
    }
    setEditingDraft(null)
    setStats(prev => ({
      ...prev,
      draftsReady: dismissed.status === 'drafted'
        ? Math.max(0, prev.draftsReady - 1)
        : prev.draftsReady,
    }))

    void loadData()
    toast.success('Moved to Dismissed')
  }, [loadData, selectedThread, supabase, threads])

  const handleCheckNow = async () => {
    if (checkingNow) return
    setCheckingNow(true)
    toast.info('Checking for new posts...')
    try {
      const { data: keywords, error } = await supabase
        .from('keywords')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
      if (error) throw error
      const keyword = keywords?.[0]
      if (!keyword) throw new Error('no_active_keyword')

      const response = await fetch('/api/keywords/fetch-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId: keyword.id }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || payload?.error || 'scan_request_failed')
      }
      toast.success('Check requested. Refreshing...')
      window.setTimeout(() => void loadData(), 3000)
    } catch (error) {
      console.error('[dashboard] Unable to request a monitoring check', error)
      toast.error(error instanceof Error && error.message === 'no_active_keyword'
        ? 'Activate a monitoring rule before checking now.'
        : 'Could not request a new scan. Try again.')
    } finally {
      setCheckingNow(false)
    }
  }

  const handleMarkAsPosted = async (threadToMark?: Thread) => {
    const thread = threadToMark || selectedThread
    if (!thread) return
    try {
      const response = await fetch('/api/replies/mark-posted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.id, text: thread.draft, platform: thread.platform }),
      })
      if (!response.ok) throw new Error('mark_posted_failed')
      clearSupabaseReadCache()
      trackEvent('reply_marked_posted', {
        thread_id: thread.id,
        platform: thread.platform,
        target: thread.target,
      })
      setThreads(prev => prev.filter(item => item.id !== thread.id))
      setSelectedThread(threads.find(item => item.id !== thread.id) || null)
      setEditingDraft(null)
      setStats(prev => ({ ...prev, repliesSent: prev.repliesSent + 1 }))
      setTotalSent(prev => prev + 1)
      void loadData()
      toast.success('Marked as posted')
    } catch (error) {
      console.error('[dashboard] Unable to mark reply as posted', error)
      toast.error('Could not confirm this reply as posted')
    }
  }

  const handleBuyAddon = async (type: BillingAddonType) => {
    if (openingAddonCheckout) return
    setOpeningAddonCheckout(type)
    try {
      const idempotencyKey = crypto.randomUUID()
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ addon: type }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'checkout_failed')
      }
      window.location.href = payload.url
    } catch (error) {
      setOpeningAddonCheckout(null)
      if (error instanceof Error && error.message === 'addon_billing_not_configured') {
        toast.error('This add-on is temporarily unavailable. No charge was created.')
        return
      }
      toast.error('Could not open add-on checkout')
    }
  }

  const generateReplyForThread = async (threadToDraft: Thread) => {
    if (regenerating) return
    const isFirstDraft = !threadToDraft.draft
    setSelectedThread(threadToDraft)
    setRegenerating(true)
    toast.info(isFirstDraft ? 'Preparing reply...' : 'Rewriting reply...')
    try {
      const res = await fetch('/api/replies/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: threadToDraft.id })
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        if (res.status === 403 && payload?.error === 'plan_limit_reached' && payload?.limit === 'ai_drafts') {
          toast.error('Draft limit reached. Add 20 more drafts for $5.')
          return
        }
        throw new Error(payload?.message || payload?.error || 'Failed to request regeneration')
      }

      const { draft } = await res.json()
      clearSupabaseReadCache()
      trackEvent(isFirstDraft ? 'reply_draft_generated' : 'reply_regenerated', {
        thread_id: threadToDraft.id,
        platform: threadToDraft.platform,
        target: threadToDraft.target,
      })

      if (!isFirstDraft) {
        fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: threadToDraft.id,
            originalDraft: threadToDraft.draft,
            finalDraft: draft,
            actionType: 'REGENERATE_REQUESTED',
            platform: threadToDraft.platform,
            targetCommunity: threadToDraft.target,
            keywordCluster: threadToDraft.matchedKeyword,
          }),
        }).catch(console.error)
      }

      setThreads(prev => prev.map(t => t.id === threadToDraft.id ? { ...t, draft, originalDraft: draft, status: 'drafted' } : t))
      setSelectedThread(prev => prev?.id === threadToDraft.id ? { ...prev, draft, originalDraft: draft, status: 'drafted' } : prev)
      if (isFirstDraft && threadToDraft.status !== 'drafted' && threadToDraft.status !== 'needs_manual_reply') {
        setStats(prev => ({ ...prev, draftsReady: prev.draftsReady + 1 }))
      }
      window.dispatchEvent(new Event('buyerwatch:credits-changed'))
      void loadData()
      toast.success(isFirstDraft ? 'Reply ready.' : 'Reply rewritten.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to request regeneration')
    } finally {
      setRegenerating(false)
    }
  }

  const normalizedSearch = deferredSearchQuery.trim().toLowerCase()
  const searchableThreads = normalizedSearch
    ? threads.filter(thread => [
      thread.title,
      thread.content,
      thread.target,
      thread.matchedKeyword,
      thread.platform,
    ].some(value => value.toLowerCase().includes(normalizedSearch)))
    : threads

  const filtered = filterTab === 'dismissed'
    ? searchableThreads.filter(t => t.status === 'dismissed')
    : filterTab === 'high-intent'
      ? searchableThreads.filter(t => t.status !== 'dismissed' && t.score !== null && t.score >= highIntentThreshold)
      : searchableThreads.filter(t => t.status !== 'dismissed' && t.score !== null)
  const signalLimitReached = plan === 'free' && signalUsage.used >= signalUsage.limit
  const draftLimitReached = plan === 'free' && draftUsage.used >= draftUsage.limit
  const metricPeriodLabel = getDashboardMetricPeriodLabel(metricsPeriod)
  const metricsAreLoading = loading || metricsLoading

  const dismissedCount = threads.filter(t => t.status === 'dismissed').length
  const highIntentCount = threads.filter(t => t.status !== 'dismissed' && t.score !== null && t.score >= highIntentThreshold).length
  const lowRelevanceThreads = filterTab === 'all'
    ? filtered.filter(thread => isLowRelevanceScore(thread.score))
    : []
  const primaryThreads = filterTab === 'all'
    ? filtered.filter(thread => !isLowRelevanceScore(thread.score))
    : filtered
  const lowRelevanceExpanded = showLowRelevance || Boolean(normalizedSearch)
  const feedItems = [
    ...primaryThreads.map(thread => ({
      kind: 'thread' as const,
      thread,
      isLowRelevance: isLowRelevanceScore(thread.score),
    })),
    ...(lowRelevanceThreads.length > 0 ? [{ kind: 'low-toggle' as const }] : []),
    ...(lowRelevanceExpanded
      ? lowRelevanceThreads.map(thread => ({ kind: 'thread' as const, thread, isLowRelevance: true }))
      : []),
  ]

  if (loadFailed) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Overview" />
        <DataLoadError
          title="Couldn’t load your dashboard"
          description="Your conversations and drafts are still safe. Check your connection and try loading the dashboard again."
          onRetry={() => void loadData()}
        />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 max-w-5xl mx-auto pb-16">
      {/* Post-upgrade modal */}
      {!loading && userId && (
        <UpgradeModal
          userId={userId}
          plan={plan}
          keywordsUsed={keywordsCount}
          keywordsMax={keywordsMax}
        />
      )}

      {/* Header & Actions */}
      <PageHeader
        title="Overview"
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {keywordsCount > 0 && (
              <a
                href="/keywords"
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors shadow-2xs ${
                  pollHealth.delayedRules > 0
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
                title={pollHealth.delayedRules > 0
                  ? `${pollHealth.delayedRules} of ${pollHealth.activeRules} active rules delayed. Open Keywords for details.`
                  : 'Recent active source status'}
              >
                {pollHealth.delayedRules > 0
                  ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  : <RefreshCcw className="h-3.5 w-3.5 text-gray-400" />}
                {pollHealth.delayedRules > 0
                  ? `${pollHealth.delayedRules} failing`
                  : pollHealth.lastSuccessfulAt
                    ? `Checked ${formatTimeAgo(pollHealth.lastSuccessfulAt)}`
                    : 'Monitoring active'}
              </a>
            )}

            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <select
                aria-label="KPI date range"
                value={metricsPeriod}
                onChange={(event) => {
                  const nextPeriod = event.target.value
                  if (!isDashboardMetricPeriod(nextPeriod) || nextPeriod === metricsPeriod) return
                  setMetricsLoading(true)
                  setMetricsPeriod(nextPeriod)
                }}
                className="h-8 appearance-none rounded-lg border border-gray-200 bg-white pl-8 pr-7 text-[12px] font-medium text-gray-700 shadow-2xs outline-none transition-colors hover:border-gray-300 focus:border-gray-400 cursor-pointer"
              >
                {DASHBOARD_METRIC_PERIODS.map((period) => (
                  <option key={period} value={period}>{getDashboardMetricPeriodLabel(period)}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>

            <GettingStartedChecklist
              keywordsCount={keywordsCount}
              hasInspectedLead={hasInspectedLead}
              hasCopiedOrApproved={hasCopiedOrApproved}
              autoSendEnabled={autoSendEnabled}
            />

            {keywordsCount > 0 && (
              <a
                href="/keywords"
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-[12px] font-medium text-white shadow-xs transition-colors hover:bg-gray-800"
              >
                <Target className="w-3.5 h-3.5" />
                Add Keyword
              </a>
            )}
          </div>
        )}
      />

      {/* 4 Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Found"
          value={stats.threadsFound}
          period={metricPeriodLabel}
          icon={MessageCircle}
          loading={metricsAreLoading}
        />
        <MetricCard
          label="High Intent"
          value={stats.highIntent}
          badge={
            stats.highIntentToday > 0 ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                <ArrowUp className="h-3 w-3" />+{stats.highIntentToday} today
              </span>
            ) : undefined
          }
          period={stats.highIntentToday === 0 ? metricPeriodLabel : undefined}
          icon={Sparkles}
          loading={metricsAreLoading}
        />
        <MetricCard
          label="Drafts Ready"
          value={stats.draftsReady}
          actionLink={stats.draftsReady > 0 ? { label: 'Review →', href: '/opportunities/replies' } : undefined}
          period={stats.draftsReady === 0 ? 'All reviewed' : undefined}
          icon={FileText}
          loading={metricsAreLoading}
        />
        <MetricCard
          label="Replies Sent"
          value={stats.repliesSent}
          period={metricPeriodLabel}
          icon={Send}
          loading={metricsAreLoading}
        />
      </div>

      {/* Upgrade Banner */}
      {!loading && plan === 'free' && keywordsCount >= keywordsMax && stats.highIntent > 0 && !bannerDismissed && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-2xs sm:flex-row sm:items-center sm:px-5">
          <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="flex-1 text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">{stats.highIntent} high-intent lead{stats.highIntent !== 1 ? 's' : ''} found</span>{' '}
            in {metricPeriodLabel.toLowerCase()} across your {keywordsMax} active topic{keywordsMax !== 1 ? 's' : ''}. Upgrade to Pro for unlimited keywords.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/pricing"
              className="inline-flex h-7 items-center rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-800"
            >
              Upgrade
            </a>
            <button
              onClick={() => setBannerDismissed(true)}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-amber-700 transition-colors hover:bg-amber-100"
              aria-label="Dismiss upgrade suggestion"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Limit Notice Cards */}
      {!loading && (signalLimitReached || draftLimitReached) && (
        <div className="grid gap-3 md:grid-cols-2">
          {signalLimitReached && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3.5 shadow-xs">
              <div>
                <p className="text-xs font-semibold text-gray-900">Signal limit reached</p>
                <p className="text-[11.5px] text-gray-500">{signalUsage.used}/{signalUsage.limit} signals used this month</p>
              </div>
              <button
                type="button"
                onClick={() => void handleBuyAddon('signals')}
                disabled={Boolean(openingAddonCheckout)}
                className="h-7 px-3 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {openingAddonCheckout === 'signals' ? 'Opening...' : BILLING_ADDONS.signals.ctaLabel}
              </button>
            </div>
          )}
          {draftLimitReached && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3.5 shadow-xs">
              <div>
                <p className="text-xs font-semibold text-gray-900">Draft limit reached</p>
                <p className="text-[11.5px] text-gray-500">{draftUsage.used}/{draftUsage.limit} drafts used this month</p>
              </div>
              <button
                type="button"
                onClick={() => void handleBuyAddon('drafts')}
                disabled={Boolean(openingAddonCheckout)}
                className="h-7 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {openingAddonCheckout === 'drafts' ? 'Opening...' : BILLING_ADDONS.drafts.ctaLabel}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs & Feed Counts */}
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
              <div role="tablist" aria-label="Conversation filters" className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { setFilterTab('all'); setShowLowRelevance(false) }}
                  className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                    filterTab === 'all'
                      ? 'bg-gray-900 text-white shadow-xs'
                      : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 shadow-2xs'
                  }`}
                >
                  All Conversations
                </button>
                <button
                  type="button"
                  onClick={() => { setFilterTab('high-intent'); setShowLowRelevance(false) }}
                  className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterTab === 'high-intent'
                      ? 'bg-gray-900 text-white shadow-xs'
                      : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 shadow-2xs'
                  }`}
                >
                  <span>High Intent (≥{highIntentThreshold}%)</span>
                  {highIntentCount > 0 && (
                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      filterTab === 'high-intent' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700 border border-blue-100'
                    }`}>
                      {highIntentCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setFilterTab('dismissed'); setShowLowRelevance(false) }}
                  className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterTab === 'dismissed'
                      ? 'bg-gray-900 text-white shadow-xs'
                      : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 shadow-2xs'
                  }`}
                >
                  <span>Dismissed</span>
                  {dismissedCount > 0 && (
                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      filterTab === 'dismissed' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {dismissedCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="text-[12px] font-medium text-gray-400">
                {searchLoading
                  ? 'Searching...'
                  : `${filtered.length} ${filtered.length === 1 ? 'conversation' : 'conversations'}`}
              </div>
            </div>

            {/* Conversation Feed */}
            <div className="space-y-3.5">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse space-y-3">
                      <div className="flex justify-between">
                        <div className="h-4 bg-gray-200 rounded w-1/4" />
                        <div className="h-4 bg-gray-100 rounded w-16" />
                      </div>
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-full" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-14 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                    <Search className="h-6 w-6 text-gray-300" />
                  </div>
                  <p className="text-[14.5px] font-semibold text-gray-900 mb-1">
                    {normalizedSearch ? 'No matching conversations' : 'No conversations in this view'}
                  </p>
                  <p className="text-[13px] text-gray-400 max-w-xs leading-relaxed mb-3">
                    {normalizedSearch
                      ? 'Try different keywords, communities, or platform filters.'
                      : keywordsCount === 0
                        ? 'Add keywords to start discovering buyer conversations.'
                        : `Monitoring ${keywordsCount} active topic${keywordsCount > 1 ? 's' : ''}. New leads will appear here.`}
                  </p>
                  {keywordsCount > 0 && !normalizedSearch && (
                    <button
                      type="button"
                      onClick={() => void handleCheckNow()}
                      disabled={checkingNow}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
                    >
                      <RefreshCcw className={`h-3.5 w-3.5 ${checkingNow ? 'animate-spin' : ''}`} />
                      {checkingNow ? 'Checking...' : 'Check now'}
                    </button>
                  )}
                </div>
              ) : (
                feedItems.map((item) => {
                  if (item.kind === 'low-toggle') {
                    return (
                      <div
                        key="low-relevance-toggle"
                        className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-2.5 flex items-center justify-between text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => setShowLowRelevance(curr => !curr)}
                          className="flex items-center gap-2 font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                        >
                          <span>{showLowRelevance ? 'Hide' : 'Show'} {lowRelevanceThreads.length} low-relevance match{lowRelevanceThreads.length === 1 ? '' : 'es'}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLowRelevance ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    )
                  }

                  const { thread, isLowRelevance } = item
                  const isReddit = thread.platform === 'reddit'
                  const isEditingThisDraft = editingDraft === thread.id
                  const hoursLeft = getWindowHoursLeft(thread.createdAt)

                  return (
                    <article
                      key={thread.id}
                      id={`conversation-${thread.id}`}
                      className={`rounded-xl border bg-white shadow-xs overflow-hidden transition-colors ${
                        isLowRelevance ? 'border-gray-200 opacity-80' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 bg-gray-50/30">
                        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                          <PlatformIcon platform={thread.platform} />
                          <span className="font-bold text-gray-900">
                            {isReddit ? `r/${thread.target}` : thread.target}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400 font-medium">{thread.timeAgo}</span>

                          {/* Community Health */}
                          {communityHealth[thread.target] && (() => {
                            const h = communityHealth[thread.target]
                            if (h.total_engagements < 3) return null
                            const isSafe = h.rejection_rate < 0.05
                            const isModerate = h.rejection_rate >= 0.05 && h.rejection_rate < 0.2
                            return (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold border ${
                                isSafe
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  : isModerate
                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                    : 'bg-red-50 text-red-700 border-red-100'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isSafe ? 'bg-emerald-500' : isModerate ? 'bg-amber-500' : 'bg-red-500'}`} />
                                {isSafe ? 'Safe' : isModerate ? 'Moderate' : 'Strict'}
                              </span>
                            )
                          })()}

                          {/* Google Ranked */}
                          {thread.googleRanked && (
                            <span className="inline-flex items-center gap-1 rounded bg-blue-50 border border-blue-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-700">
                              <Globe className="w-3 h-3" />
                              Ranked on Google
                            </span>
                          )}

                          {/* Closing Soon */}
                          {hoursLeft !== null && hoursLeft <= 6 && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
                              Closes in {hoursLeft}h
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <IntentBadge score={thread.score} label={thread.label} />
                          {getSafeThreadUrl(thread) && (
                            <a
                              href={getSafeThreadUrl(thread) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11.5px] font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                              title="Open original thread"
                            >
                              <span>Open post</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {thread.status !== 'dismissed' && (
                            <button
                              type="button"
                              onClick={() => void handleDismiss(thread.id)}
                              className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                              title="Dismiss"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="px-5 py-4">
                        {thread.title && (
                          <h3 className="text-[14.5px] font-bold text-gray-900 leading-snug mb-1.5">
                            {thread.title}
                          </h3>
                        )}
                        <p className="text-[13px] leading-relaxed text-gray-600 line-clamp-3">
                          {thread.content}
                        </p>

                        {/* Metadata row */}
                        <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                          {thread.matchedKeyword && (
                            <span className="rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                              Matched keyword: {thread.matchedKeyword}
                            </span>
                          )}
                          {isReddit && selectedThread?.id === thread.id && (
                            <RedditCommunityPolicyNotice subreddit={thread.target} compact />
                          )}
                        </div>
                      </div>

                      {/* Integrated Action / Draft Area */}
                      <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3.5">
                        {isEditingThisDraft ? (
                          /* Inline Draft Editor */
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[11.5px] font-semibold text-gray-700">Edit Your Reply</span>
                              <button
                                type="button"
                                onClick={() => setEditingDraft(null)}
                                className="h-6 px-2 rounded text-[11.5px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              >
                                Done
                              </button>
                            </div>
                            <textarea
                              className="w-full min-h-[140px] rounded-xl border border-gray-200 bg-white p-3.5 text-[13px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5 transition-all"
                              value={thread.draft || ''}
                              placeholder="Write your reply..."
                              onChange={(e) => {
                                const updated = e.target.value
                                setThreads(prev => prev.map(item => item.id === thread.id ? { ...item, draft: updated } : item))
                                setSelectedThread(prev => prev?.id === thread.id ? { ...prev, draft: updated } : prev)
                              }}
                              autoFocus
                              spellCheck
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] text-gray-400 tabular-nums font-medium">
                                {(thread.draft || '').length} characters
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void generateReplyForThread(thread)}
                                  disabled={regenerating}
                                  className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
                                  title="Rewrite reply"
                                >
                                  <RefreshCcw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                                  Rewrite
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleCopyDraft(thread)}
                                  className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
                                >
                                  <Copy className="h-3.5 w-3.5 text-gray-400" />
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleMarkAsPosted(thread)}
                                  className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
                                >
                                  Mark posted
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleApproveAndSend(thread)}
                                  disabled={sendingThreadId === thread.id}
                                  className="h-8 px-3.5 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  {sendingThreadId === thread.id
                                    ? (thread.platform === 'reddit' ? 'Preparing...' : 'Posting...')
                                    : getDeliveryActionLabel(thread.platform)}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : thread.draft ? (
                          /* Existing Draft Preview */
                          <div className="space-y-3">
                            <div className="rounded-xl border border-emerald-200 bg-[#F2FCF7] p-3.5">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-[#3A6B50]">
                                  BuyerWatch Draft
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleInspectThread(thread)
                                    setEditingDraft(thread.id)
                                  }}
                                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#3A6B50] hover:underline cursor-pointer"
                                >
                                  <Edit3 className="h-3 w-3" />
                                  Edit
                                </button>
                              </div>
                              <p className="text-[13px] leading-relaxed text-[#1C1C1A] whitespace-pre-wrap">
                                {thread.draft}
                              </p>
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => void generateReplyForThread(thread)}
                                disabled={regenerating}
                                className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
                                title="Rewrite draft"
                              >
                                <RefreshCcw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                                Rewrite
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCopyDraft(thread)}
                                className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
                              >
                                <Copy className="h-3.5 w-3.5 text-gray-400" />
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleMarkAsPosted(thread)}
                                className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
                              >
                                Mark posted
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleApproveAndSend(thread)}
                                disabled={sendingThreadId === thread.id}
                                className="h-8 px-3.5 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                              >
                                <Check className="h-3.5 w-3.5" />
                                {sendingThreadId === thread.id
                                  ? (thread.platform === 'reddit' ? 'Preparing...' : 'Posting...')
                                  : getDeliveryActionLabel(thread.platform)}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* No Draft Yet */
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-gray-400 font-medium">
                              {isLowRelevance ? 'Low relevance match' : 'No draft created yet'}
                            </span>
                            <button
                              type="button"
                              onClick={() => void generateReplyForThread(thread)}
                              disabled={regenerating}
                              className="h-8 px-3.5 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <Sparkles className="h-3.5 w-3.5 text-blue-300" />
                              {regenerating && selectedThread?.id === thread.id
                                ? 'Generating...'
                                : 'Generate reply'}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </div>
        </div>
  )
}
