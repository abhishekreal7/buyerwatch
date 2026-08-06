'use client'

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { Search, Target, CheckCircle, MessageCircle, ExternalLink, X, RefreshCcw, Copy, FileText, Lock, Sparkles, Globe, ArrowUp } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import { toast } from 'sonner'
import { UpgradeModal } from '@/components/UpgradeModal'
import { GettingStartedChecklist } from '@/components/GettingStartedChecklist'
import { BlueskyIcon, RedditIcon, XIcon } from '@/components/Icons'
import { PageHeader } from '@/components/PageHeader'
import { normalizePlan, type PlanTier } from '@/lib/plan-limits'
import {
  BILLING_ADDONS,
  getCurrentUsageMonth,
  getPlanLimitsWithAddons,
  sumMonthlyAddonCredits,
  type BillingAddonType,
} from '@/lib/billing-addons'
import { useDashboardSession } from '@/components/DashboardContext'
import { getIntentDisplayLabel, type IntentLabel } from '@/lib/intent'
import { useExtensionStatus } from '@/components/ExtensionInstall'
import { getSafeThreadUrl } from '@/lib/thread-url'
import { IntentBadge } from '@/components/IntentBadge'
import { waitForReplyDelivery, type ReplySendResult } from '@/lib/reply-send-client'
import { openRedditAssistedReply } from '@/lib/reddit-assist-client'
import {
  DEFAULT_HIGH_INTENT_THRESHOLD,
  normalizeHighIntentThreshold,
} from '@/lib/high-intent-threshold'
import { useConversationSearch } from '@/lib/conversation-search'

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
  reasoning?: string         // Feature 1: Signal Trace
  googleRanked?: boolean     // Feature 5: Thread Consequence Score
  createdAt: string          // Feature 4: Approval-First window countdown
  status: string
  reviewedAt: string | null
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

/** Feature 4: Returns hours remaining before the 24h Reddit relevance window closes, or null if expired */
function getWindowHoursLeft(createdAt: string): number | null {
  const WINDOW_HOURS = 24
  const created = new Date(createdAt)
  const now = new Date()
  const hoursElapsed = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
  const hoursLeft = WINDOW_HOURS - hoursElapsed
  if (hoursLeft <= 0) return null
  return Math.floor(hoursLeft)
}

function getDeliveryActionLabel(platform: string, extensionInstalled: boolean) {
  if (platform === 'reddit') {
    return extensionInstalled ? 'Prefill in Reddit' : 'Copy & Open Reddit'
  }
  if (platform === 'bluesky') return 'Post through Bluesky'
  return 'Review delivery'
}

function mapThread(thread: any): Thread {
  const score = thread.intent_score === null || thread.intent_score === undefined
    ? null
    : Number(thread.intent_score)

  return {
    id: thread.id,
    platform: thread.platform,
    target: (thread.keywords as { target?: string } | null)?.target || thread.platform,
    timeAgo: formatTimeAgo(thread.created_at),
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
    createdAt: thread.created_at,
    status: thread.status || 'pending',
    reviewedAt: thread.reviewed_at || null,
  }
}

export default function DashboardPage() {
  const showLegacyReview = process.env.NEXT_PUBLIC_BUYERWATCH_LEGACY_REVIEW === '1'
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [totalSent, setTotalSent] = useState(0)
  const [plan, setPlan] = useState<PlanTier>('free')
  const [regenerating, setRegenerating] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'high-intent' | 'dismissed'>('all')
  const { conversationSearch: searchQuery } = useConversationSearch()
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const searchQueryRef = useRef('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [communityHealth, setCommunityHealth] = useState<Record<string, { rejection_rate: number; total_engagements: number }>>({}) // Feature 3
  const [editingDraft, setEditingDraft] = useState<string | null>(null) // Feature 4: inline draft edit
  const [stats, setStats] = useState({
    threadsFound: 0,
    highIntent: 0,
    highIntentToday: 0,
    draftsReady: 0,
    postedToday: 0,
  })
  const [keywordsCount, setKeywordsCount] = useState(0)
  const [keywordsMax, setKeywordsMax] = useState(1)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [hasInspectedLead, setHasInspectedLead] = useState(false)
  const [hasCopiedOrApproved, setHasCopiedOrApproved] = useState(false)
  const [autoSendEnabled, setAutoSendEnabled] = useState(false)
  const [highIntentThreshold, setHighIntentThreshold] = useState(DEFAULT_HIGH_INTENT_THRESHOLD)
  const [sendingThreadId, setSendingThreadId] = useState<string | null>(null)
  const [signalUsage, setSignalUsage] = useState({ used: 0, limit: 250 })
  const [draftUsage, setDraftUsage] = useState({ used: 0, limit: 40 })
  const [openingAddonCheckout, setOpeningAddonCheckout] = useState<BillingAddonType | null>(null)
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()
  const { isInstalled: extensionInstalled } = useExtensionStatus()
  const loadData = useCallback(async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString()
    const activeStatuses = ['pending', 'drafted', 'needs_manual_reply']
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
        .from('draft_feedback')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('action_type', ['COPIED', 'APPROVED', 'EDITED_APPROVED', 'AUTO_SENT']),
      supabase
        .from('monitored_threads')
        .select('*, reply_analytics(draft_text), keywords(term, target)')
        .eq('user_id', userId)
        .in('status', ['pending', 'drafted', 'needs_manual_reply', 'dismissed'])
        .not('intent_score', 'is', null)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('monitored_threads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', activeStatuses)
        .not('intent_score', 'is', null),
      supabase
        .from('monitored_threads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['drafted', 'needs_manual_reply']),
      supabase
        .from('reply_analytics')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('was_sent', true)
        .gte('sent_at', todayIso),
      supabase
        .from('reply_analytics')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('was_sent', true),
    ])

    const profileResult = await profileResultPromise
    const profile = profileResult.data
    const effectiveHighIntentThreshold = normalizeHighIntentThreshold(
      profile?.high_intent_threshold,
    )
    const [
      [
        addonCreditsResult,
        keywordsCountResult,
        feedbackCountResult,
        threadsResult,
        activeThreadsCountResult,
        draftsCountResult,
        postedTodayCountResult,
        totalPostedCountResult,
      ],
      highIntentCountResult,
      highIntentTodayCountResult,
    ] = await Promise.all([
      independentResultsPromise,
      supabase
        .from('monitored_threads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', activeStatuses)
        .gte('intent_score', effectiveHighIntentThreshold),
      supabase
        .from('monitored_threads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', activeStatuses)
        .gte('intent_score', effectiveHighIntentThreshold)
        .gte('created_at', todayIso),
    ])

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

    // Load persisted setup progress rather than resetting the checklist per session.
    setKeywordsCount(keywordsCountResult.count ?? 0)
    setHasCopiedOrApproved((feedbackCountResult.count ?? 0) > 0)

    // Load threads including dismissed for audit tab
    const { data: threadData, error } = threadsResult

    if (error) {
      toast.error('Failed to load threads')
      setLoading(false)
      return
    }

    const parsed = (threadData || []).map(mapThread)

    if (!searchQueryRef.current) setThreads(parsed)
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
    } else if (activeParsed.length > 0) {
      setSelectedThread(activeParsed[0])
    } else {
      setSelectedThread(null)
    }

    // Feature 3: Load community health for all unique targets
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
      threadsFound: activeThreadsCountResult.count ?? 0,
      highIntent: highIntentCountResult.count ?? 0,
      highIntentToday: highIntentTodayCountResult.count ?? 0,
      draftsReady: draftsCountResult.count ?? 0,
      postedToday: postedTodayCountResult.count ?? 0,
    })

    setLoading(false)
  }, [supabase, userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const normalizedQuery = deferredSearchQuery.trim()
    const previousQuery = searchQueryRef.current
    searchQueryRef.current = normalizedQuery

    if (!normalizedQuery) {
      setSearchLoading(false)
      if (previousQuery) void loadData()
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
  }, [deferredSearchQuery, filterTab, highIntentThreshold, loadData])

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

  useEffect(() => {
    const handleAutoSendChanged = (event: Event) => {
      setAutoSendEnabled(Boolean((event as CustomEvent<boolean>).detail))
    }
    window.addEventListener('buyerwatch:auto-send-changed', handleAutoSendChanged)
    return () => window.removeEventListener('buyerwatch:auto-send-changed', handleAutoSendChanged)
  }, [])

  useEffect(() => {
    const handleOpenThread = (event: Event) => {
      const threadId = (event as CustomEvent<string>).detail
      const thread = threads.find(item => item.id === threadId)
      if (!thread) return
      setFilterTab(thread.status === 'dismissed' ? 'dismissed' : 'all')
      setSelectedThread(thread)
      setHasInspectedLead(true)
    }

    window.addEventListener('buyerwatch:open-thread', handleOpenThread)
    return () => window.removeEventListener('buyerwatch:open-thread', handleOpenThread)
  }, [threads])

  useEffect(() => {
    const requestedThreadId = new URLSearchParams(window.location.search).get('thread')
    if (!requestedThreadId || selectedThread?.id !== requestedThreadId) return

    const frame = window.requestAnimationFrame(() => {
      const card = document.getElementById(`conversation-${requestedThreadId}`)
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      card?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedThread])

  const handleInspectThread = async (thread: Thread) => {
    setSelectedThread(thread)
    setHasInspectedLead(true)
    if (thread.reviewedAt || !userId) return

    const reviewedAt = new Date().toISOString()
    setThreads(prev => prev.map(item => item.id === thread.id ? { ...item, reviewedAt } : item))
    setSelectedThread(prev => prev?.id === thread.id ? { ...prev, reviewedAt } : prev)
    const { error } = await supabase.rpc('mark_thread_reviewed', {
      p_user_id: userId,
      p_thread_id: thread.id,
    })
    if (error) {
      setThreads(prev => prev.map(item => item.id === thread.id ? { ...item, reviewedAt: null } : item))
      setSelectedThread(prev => prev?.id === thread.id ? { ...prev, reviewedAt: null } : prev)
      setHasInspectedLead(threads.some(item => Boolean(item.reviewedAt)))
    }
  }

  const handleApproveAndSend = async () => {
    if (!selectedThread || !selectedThread.draft || sendingThreadId) return
    const thread = selectedThread
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
      const payload = await res.json().catch(() => null) as (ReplySendResult & { error?: string }) | null
      if (!res.ok || !payload) throw new Error(payload?.error || 'Failed to dispatch reply')

      if (payload.mode === 'manual') {
        const mode = await openRedditAssistedReply({
          threadId: payload.threadId,
          text: payload.text,
          postUrl: payload.postUrl,
          extensionInstalled,
        })
        setHasCopiedOrApproved(true)
        toast.success(mode === 'prefill'
          ? 'Opening Reddit with your reply prefilled. Review it, then submit on Reddit.'
          : 'Reply copied. Post it on Reddit, then click Mark as Posted.')
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
      setThreads(prev => prev.filter(item => item.id !== thread.id))
      setSelectedThread(current => current?.id === thread.id
        ? threads.find(item => item.id !== thread.id) || null
        : current)
      setEditingDraft(null)
      setTotalSent(prev => prev + 1)
      setStats(prev => ({ ...prev, postedToday: prev.postedToday + 1 }))
      void loadData()
      toast.success(totalSent === 0 ? 'First reply posted successfully.' : 'Reply posted successfully.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reply')
    } finally {
      setSendingThreadId(null)
    }
  }

  const handleCopyDraft = async () => {
    if (!selectedThread?.draft) return
    try {
      await navigator.clipboard.writeText(selectedThread.draft)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy the draft')
      return
    }

    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: selectedThread.id,
        originalDraft: selectedThread.originalDraft,
        finalDraft: selectedThread.draft,
        actionType: 'COPIED',
        platform: selectedThread.platform,
        targetCommunity: selectedThread.target,
        keywordCluster: selectedThread.matchedKeyword,
      }),
    }).catch(() => null)
    if (response?.ok) setHasCopiedOrApproved(true)
  }

  const handleDismiss = async (threadToDismiss?: Thread) => {
    const dismissed = threadToDismiss ?? selectedThread
    if (!dismissed || dismissed.status === 'dismissed') return

    setThreads(prev => prev.map(thread => (
      thread.id === dismissed.id ? { ...thread, status: 'dismissed' } : thread
    )))
    if (selectedThread?.id === dismissed.id) {
      setSelectedThread(
        threads.find(thread => thread.id !== dismissed.id && thread.status !== 'dismissed') || null,
      )
    }
    setEditingDraft(null)
    setStats(prev => ({
      ...prev,
      threadsFound: Math.max(0, prev.threadsFound - 1),
      highIntent: dismissed.score !== null && dismissed.score >= highIntentThreshold
        ? Math.max(0, prev.highIntent - 1)
        : prev.highIntent,
      draftsReady: dismissed.status === 'drafted'
        ? Math.max(0, prev.draftsReady - 1)
        : prev.draftsReady,
    }))

    const { error } = await supabase.rpc('dismiss_thread', { p_thread_id: dismissed.id })
    if (error) {
      toast.error('Could not dismiss this conversation')
      await loadData()
      return
    }
    void loadData()
    toast.success('Moved to Dismissed')
  }

  const handleMarkAsPosted = async () => {
    if (!selectedThread) return
    const thread = selectedThread
    const response = await fetch('/api/replies/mark-posted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: thread.draft, platform: thread.platform }),
    })
    if (!response.ok) {
      toast.error('Could not confirm this reply as posted')
      return
    }
    clearSupabaseReadCache()
    setThreads(prev => prev.filter(item => item.id !== thread.id))
    setSelectedThread(threads.find(item => item.id !== thread.id) || null)
    setEditingDraft(null)
    setStats(prev => ({ ...prev, postedToday: prev.postedToday + 1 }))
    setTotalSent(prev => prev + 1)
    void loadData()
    toast.success('Marked as posted')
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
        throw new Error()
      }

      const { draft } = await res.json()
      clearSupabaseReadCache()

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
    } catch {
      toast.error('Failed to request regeneration')
    } finally {
      setRegenerating(false)
    }
  }

  const handleRegenerate = async () => {
    if (!selectedThread) return
    await generateReplyForThread(selectedThread)
  }

  const handleReplyBubbleClick = (thread: Thread) => {
    void handleInspectThread(thread)
    if (thread.draft) {
      setEditingDraft(thread.id)
      return
    }
    void generateReplyForThread(thread)
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

  useEffect(() => {
    if (selectedThread && !filtered.some(t => t.id === selectedThread.id)) {
      setSelectedThread(null)
    }
  }, [filterTab, deferredSearchQuery, highIntentThreshold, threads])

  return (
    <div className="w-full space-y-6">

      {/* Post-upgrade modal — shown once per plan tier per browser, via localStorage */}
      {!loading && userId && (
        <UpgradeModal
          userId={userId}
          plan={plan}
          keywordsUsed={keywordsCount}
          keywordsMax={keywordsMax}
        />
      )}

      {/* ElevenLabs-style Page Title Header & Top Action Row */}
      <PageHeader
        title="Overview"
        action={(
          <div className="flex items-center gap-2">
            <GettingStartedChecklist
              extensionInstalled={extensionInstalled}
              keywordsCount={keywordsCount}
              hasInspectedLead={hasInspectedLead}
              hasCopiedOrApproved={hasCopiedOrApproved}
              autoSendEnabled={autoSendEnabled}
            />
            {keywordsCount > 0 && (
              <a
                href="/keywords"
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-gray-800 sm:min-h-0"
              >
                <Target className="w-3.5 h-3.5" strokeWidth={2.2} />
                + Add Keyword
              </a>
            )}
          </div>
        )}
      />

      {/* ElevenLabs Style 4 Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Conversations Found */}
        <div className="relative rounded-2xl border border-[#E3E3E0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.055)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-semibold text-[#4F5865]">Conversations Found</span>
            <div className="w-8 h-8 rounded-xl text-[#0A84FF] flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4" strokeWidth={2} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900 tracking-tight">
              {loading ? '—' : stats.threadsFound}
            </span>
            <span className="text-[11.5px] font-medium text-[#667085]">Pending review</span>
          </div>
        </div>

        {/* Metric 2: High Intent */}
        <div className="rounded-2xl border border-[#E3E3E0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.055)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-semibold text-[#4F5865]">High Intent (≥{highIntentThreshold}%)</span>
            <div className="w-8 h-8 rounded-xl text-emerald-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" strokeWidth={2} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900 tracking-tight">
              {loading ? '—' : stats.highIntent}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${stats.highIntentToday > 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-[#F1F2F3] text-[#667085]'
              }`}>
              {stats.highIntentToday > 0 && <ArrowUp className="mr-0.5 h-3 w-3" strokeWidth={2.25} />}
              {stats.highIntentToday > 0 ? `${stats.highIntentToday} new today` : 'No new today'}
            </span>
          </div>
        </div>

        {/* Metric 3: Drafts Ready */}
        <div className="rounded-2xl border border-[#E3E3E0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.055)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-semibold text-[#4F5865]">Drafts Ready</span>
            <div className="w-8 h-8 rounded-xl text-[#0A84FF] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" strokeWidth={2} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900 tracking-tight">
              {loading ? '—' : stats.draftsReady}
            </span>
            {stats.draftsReady > 0 ? (
              <a
                href="/drafts"
                className="text-[11.5px] font-semibold text-[#0A84FF] hover:underline underline-offset-2 transition-colors"
              >
                Review Now →
              </a>
            ) : (
              <span className="text-[11.5px] font-medium text-[#667085]">Up to date</span>
            )}
          </div>
        </div>

        {/* Metric 4: Posted Today */}
        <div className="rounded-2xl border border-[#E3E3E0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.055)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-semibold text-[#4F5865]">Posted Today</span>
            <div className="w-8 h-8 rounded-xl text-[#FF5101] flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M8.5 12L11 14.5L15.5 9.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900 tracking-tight">
              {loading ? '—' : stats.postedToday}
            </span>
            <span className="text-[11.5px] font-medium text-[#667085]">Automated & manual</span>
          </div>
        </div>
      </div>

      {/* ── Upgrade banner (Placement B) ────────────────────────────── */}
      {!loading && plan === 'free' && keywordsCount >= keywordsMax && stats.highIntent > 0 && !bannerDismissed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3.5 shadow-2xs sm:flex-row sm:items-center sm:px-5">
          <Sparkles className="w-5 h-5 text-amber-500 shrink-0" strokeWidth={1.75} />
          <p className="flex-1 text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">{stats.highIntent} high-intent conversation{stats.highIntent !== 1 ? 's' : ''} found</span>{' '}
            this month across your {keywordsMax} Starter keyword{keywordsMax !== 1 ? 's' : ''}. Upgrade to Professional for 10 total topics.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/pricing"
              className="inline-flex min-h-11 items-center rounded-xl bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 sm:min-h-0"
            >
              Upgrade
            </a>
            <button
              onClick={() => setBannerDismissed(true)}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-100"
              aria-label="Dismiss upgrade suggestion"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {!loading && (signalLimitReached || draftLimitReached) && (
        <div className="grid gap-3 md:grid-cols-2">
          {signalLimitReached && (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#E3E3E0] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.055)] sm:flex-row sm:items-center sm:px-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EA] text-[#FF5101]">
                <Globe className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-950">Signal limit reached</p>
                <p className="mt-0.5 text-xs text-[#667085]">
                  {signalUsage.used}/{signalUsage.limit} Starter signals used this month.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleBuyAddon('signals')}
                disabled={Boolean(openingAddonCheckout)}
                className="inline-flex min-h-10 items-center rounded-xl bg-gray-950 px-4 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
              >
                {openingAddonCheckout === 'signals' ? 'Opening...' : BILLING_ADDONS.signals.ctaLabel}
              </button>
            </div>
          )}

          {draftLimitReached && (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#E3E3E0] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.055)] sm:flex-row sm:items-center sm:px-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#0A84FF]">
                <FileText className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-950">Draft limit reached</p>
                <p className="mt-0.5 text-xs text-[#667085]">
                  {draftUsage.used}/{draftUsage.limit} Starter drafts used this month.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleBuyAddon('drafts')}
                disabled={Boolean(openingAddonCheckout)}
                className="inline-flex min-h-10 items-center rounded-xl bg-[#0A84FF] px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
              >
                {openingAddonCheckout === 'drafts' ? 'Opening...' : BILLING_ADDONS.drafts.ctaLabel}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filtered threads calculation */}
      {(() => {
        const filtered = threads.filter(t => {
          if (filterTab === 'high-intent') return t.score !== null && t.score >= highIntentThreshold && t.status !== 'dismissed'
          if (filterTab === 'dismissed') return t.status === 'dismissed'
          return t.status !== 'dismissed' && t.score !== null
        })
        const dismissedCount = threads.filter(t => t.status === 'dismissed').length

        return (
          <>
            {/* Keep one interactive surface instead of nesting controls in a card. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] pb-4">
              <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-xl bg-[#F1F2F3] p-1 no-scrollbar">
                <button
                  onClick={() => setFilterTab('all')}
                  className={`min-h-11 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer sm:min-h-0 ${filterTab === 'all' ? 'bg-white shadow-xs text-gray-950' : 'text-[#4F5865] hover:text-gray-950'}`}
                >
                  All Conversations
                </button>
                <button
                  onClick={() => setFilterTab('high-intent')}
                  className={`min-h-11 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer sm:min-h-0 ${filterTab === 'high-intent' ? 'bg-white shadow-xs text-gray-950' : 'text-[#4F5865] hover:text-gray-950'}`}
                >
                  High Intent (≥{highIntentThreshold}%)
                </button>
                <button
                  onClick={() => setFilterTab('dismissed')}
                  className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer sm:min-h-0 ${filterTab === 'dismissed' ? 'bg-white shadow-xs text-gray-950' : 'text-[#4F5865] hover:text-gray-950'}`}
                >
                  <span>Dismissed</span>
                  {dismissedCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700">
                      {dismissedCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-[#4F5865] pr-1">
                <span>{searchLoading ? 'Searching all conversations...' : filtered.length === 1 ? '1 opportunity' : `${filtered.length} opportunities`}</span>
              </div>
            </div>

            {/* Main opportunity feed */}
            <div>
              <div className="w-full space-y-4">
                {loading && (
                  <div className="flex min-h-56 items-center justify-center py-12 text-xs font-medium text-[#667085]">
                    Loading opportunities...
                  </div>
                )}

                {!loading && !searchLoading && filtered.length === 0 && normalizedSearch && (
                  <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#667085]">
                      <Search className="w-5 h-5" strokeWidth={1.8} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">No matching conversations</h3>
                      <p className="text-xs text-[#667085] mt-1">Try a different word, community, platform, or matched keyword.</p>
                    </div>
                  </div>
                )}

                {!loading && !searchLoading && filtered.length === 0 && !normalizedSearch && keywordsCount === 0 && (
                  /* ── No keywords yet — onboarding CTA ── */
                  <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 py-14 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#667085]">
                      <Search className="w-5 h-5" strokeWidth={1.8} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 tracking-tight">Your signal radar is idle</h3>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">
                        Add your first keyword to start scanning Reddit &amp; social communities for prospective buyers.
                      </p>
                    </div>
                    <a
                      href="/keywords"
                      className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-2"
                    >
                      <Target className="w-3.5 h-3.5" strokeWidth={2} />
                      Add first keyword
                    </a>
                  </div>
                )}

                {!loading && !searchLoading && filtered.length === 0 && !normalizedSearch && keywordsCount > 0 && (
                  /* Borderless empty state keeps the feed visually quiet. */
                  <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#667085]">
                      <Search className="w-5 h-5" strokeWidth={1.8} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">No conversations yet</h3>
                      <p className="text-xs text-[#667085] mt-1">Monitoring {keywordsCount} active topic{keywordsCount > 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={async () => {
                        toast.info('Checking for new posts...')
                        try {
                          const { data: kws } = await supabase.from('keywords').select('id').eq('user_id', userId).limit(1)
                          if (kws && kws.length > 0) {
                            await fetch('/api/keywords/fetch-now', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ keywordId: kws[0].id }),
                            })
                            toast.success('Check requested. Refreshing...')
                            setTimeout(() => loadData(), 3000)
                          }
                        } catch {
                          toast.error('Scan check failed')
                        }
                      }}
                      className="mt-1 flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#F1F2F3] px-3.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-[#E8EAEC]"
                    >
                      <RefreshCcw className="w-3.5 h-3.5 text-gray-400" />
                      Check now
                    </button>
                  </div>
                )}


                {filtered.map((thread) => {
                  const isReddit = thread.platform === 'reddit'

                  return (
                    <div key={thread.id} className="space-y-2.5 pb-1">
                      <article
                        id={`conversation-${thread.id}`}
                        tabIndex={-1}
                        aria-label={`Review opportunity${thread.title ? `: ${thread.title}` : ''}`}
                        className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)] transition-colors hover:border-black/15 focus:outline-none focus-visible:border-[#0A84FF]/45 focus-visible:ring-2 focus-visible:ring-[#0A84FF]/15"
                      >
                        <div>
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-text-secondary">
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F4F5F7]">
                                {thread.platform === 'reddit' ? (
                                  <>
                                    <RedditIcon className="h-[18px] w-[18px] text-[#FF4500]" />
                                    <span className="font-medium text-text-secondary text-[13px] tracking-tight">Reddit</span>
                                  </>
                                ) : thread.platform === 'x' ? (
                                  <>
                                    <XIcon className="h-[18px] w-[18px] text-[#0F1419]" />
                                    <span className="font-medium text-text-secondary text-[13px] tracking-tight">X</span>
                                  </>
                                ) : (
                                  <>
                                    <BlueskyIcon className="h-[18px] w-[18px] text-[#1185FE]" />
                                    <span className="font-medium text-text-secondary text-[13px] tracking-tight">Bluesky</span>
                                  </>
                                )}
                              </div>
                              <span>·</span>
                              <span className="font-medium text-text-primary">{isReddit ? `r/${thread.target}` : `"${thread.target}"`}</span>
                              {/* Feature 3: Community Health Badge — Fix 6.2: Sample size gate */}
                              {communityHealth[thread.target] && (() => {
                                const h = communityHealth[thread.target]
                                if (h.total_engagements < 3) {
                                  return (
                                    <span title="Gathering data (under 3 posts)" className="relative group cursor-help">
                                      <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-44 text-center text-[11px] bg-gray-900 text-white px-2 py-1 rounded-md shadow-lg z-50 leading-snug">Gathering community health data</span>
                                    </span>
                                  )
                                }
                                const isSafe = h.rejection_rate < 0.05
                                const isModerate = h.rejection_rate >= 0.05 && h.rejection_rate < 0.2
                                const color = isSafe ? 'bg-emerald-400' : isModerate ? 'bg-amber-400' : 'bg-red-400'
                                const label = isSafe ? 'Safe community' : isModerate ? 'Moderate — post carefully' : 'High rejection rate'
                                return (
                                  <span title={label} className="relative group cursor-help">
                                    <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-40 text-center text-[11px] bg-gray-900 text-white px-2 py-1 rounded-md shadow-lg z-50 leading-snug">{label}</span>
                                  </span>
                                )
                              })()}
                              <span className="ml-1 text-xs">{thread.timeAgo}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {getSafeThreadUrl(thread) && (
                                <a
                                  href={getSafeThreadUrl(thread) ?? undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-semibold text-[#4F5865] transition-colors hover:bg-[#F1F2F3] hover:text-[#0A84FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30"
                                  aria-label={`Open ${thread.platform === 'reddit' ? 'Reddit' : 'Bluesky'} post in a new tab`}
                                  title={`Open on ${thread.platform === 'reddit' ? 'Reddit' : 'Bluesky'}`}
                                >
                                  Open post
                                  <ExternalLink className="h-3 w-3" strokeWidth={1.9} />
                                </a>
                              )}
                              {/* Feature 5: Google Ranked badge */}
                              {thread.googleRanked && (
                                <span className="flex items-center gap-1 rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                  <Globe className="w-3 h-3" />
                                  Google Ranked
                                </span>
                              )}
                              {thread.status !== 'dismissed' && (
                                <button
                                  type="button"
                                  onClick={() => void handleDismiss(thread)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30"
                                  aria-label={`Dismiss ${thread.title || 'conversation'}`}
                                  title="Move to Dismissed"
                                >
                                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                                </button>
                              )}
                            </div>
                          </div>

                          {thread.title && (
                            <h3 className="mb-2 text-[15px] font-bold leading-snug text-text-primary">
                              {thread.title}
                            </h3>
                          )}
                          <p className="text-text-secondary text-[14px] line-clamp-2 mb-4 leading-relaxed">{thread.content}</p>

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-3">
                              {thread.flag === 'COMPETITOR_RISK' ? (
                                <span className="px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1.5 bg-red-100 text-red-700 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)]">
                                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                  Competitor Risk
                                </span>
                              ) : (
                                <IntentBadge score={thread.score} label={thread.label} />
                              )}
                              {thread.matchedKeyword && (
                                <span className="text-xs text-text-tertiary font-medium tracking-wide">Matched: &quot;{thread.matchedKeyword}&quot;</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {/* Feature 4: Closing Soon badge */}
                              {(() => {
                                const hoursLeft = getWindowHoursLeft(thread.createdAt)
                                if (hoursLeft !== null && hoursLeft <= 6) {
                                  return (
                                    <span className="text-xs bg-amber-50 text-amber-600 font-semibold px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                      Closes in {hoursLeft}h
                                    </span>
                                  )
                                }
                                return null
                              })()}
                            </div>
                          </div>

                          <div className="mt-4 flex justify-end border-t border-black/[0.05] pt-4 sm:pl-8">
                            {editingDraft === thread.id ? (
                              <div className="w-full max-w-[92%] sm:max-w-[68%]">
                                <div className="mb-2 flex items-center justify-between px-1">
                                  <span className="text-[11px] font-semibold text-gray-500">Your reply</span>
                                  <button
                                    type="button"
                                    onClick={() => setEditingDraft(null)}
                                    className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#0A84FF] transition-colors hover:bg-blue-50"
                                  >
                                    Done
                                  </button>
                                </div>
                                <div className="rounded-[20px] rounded-br-md bg-[#0A84FF] p-1 shadow-[0_4px_18px_rgba(10,132,255,0.16)]">
                                  <textarea
                                    className="min-h-[190px] w-full resize-none rounded-[16px] bg-white p-4 text-[13px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-white/60"
                                    value={thread.draft || ''}
                                    placeholder="Write your reply..."
                                    onChange={(event) => {
                                      const updated = event.target.value
                                      setThreads(prev => prev.map(item => item.id === thread.id ? { ...item, draft: updated } : item))
                                      setSelectedThread(prev => prev?.id === thread.id ? { ...prev, draft: updated } : prev)
                                    }}
                                    autoFocus
                                    spellCheck
                                  />
                                </div>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
                                  <span className="text-[10.5px] tabular-nums text-gray-400">
                                    {(thread.draft || '').length} characters
                                  </span>
                                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => void handleDismiss()}
                                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                      title="Dismiss thread"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleRegenerate}
                                      disabled={regenerating}
                                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                                      title="Rewrite reply"
                                    >
                                      <RefreshCcw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCopyDraft}
                                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-100"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                      Copy
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleMarkAsPosted}
                                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-100"
                                    >
                                      Mark posted
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleApproveAndSend}
                                      disabled={sendingThreadId === thread.id}
                                      className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-black"
                                    >
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      {sendingThreadId === thread.id
                                        ? (thread.platform === 'reddit' ? 'Preparing...' : 'Posting...')
                                        : getDeliveryActionLabel(thread.platform, extensionInstalled)}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleReplyBubbleClick(thread)}
                                disabled={regenerating}
                                className="group w-fit max-w-[82%] rounded-[17px] rounded-br-[5px] bg-[#0A84FF] px-4 py-3 text-left text-white shadow-[0_3px_12px_rgba(10,132,255,0.12)] transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_5px_16px_rgba(10,132,255,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 focus-visible:ring-offset-2 disabled:cursor-wait disabled:hover:translate-y-0 disabled:opacity-75 sm:max-w-[46%]"
                                aria-label={thread.draft ? 'Open full drafted reply' : 'Generate a drafted reply'}
                              >
                                {thread.draft ? (
                                  <p className="line-clamp-2 whitespace-pre-line text-[12.5px] leading-relaxed text-white">
                                    {thread.draft}
                                  </p>
                                ) : (
                                  <span className="flex items-center gap-2 text-[12.5px] font-semibold leading-relaxed text-white">
                                    <MessageCircle className="h-3.5 w-3.5 text-white/75" strokeWidth={2} />
                                    {regenerating && selectedThread?.id === thread.id ? 'Preparing reply...' : 'Generate reply'}
                                  </span>
                                )}
                                {thread.draft && (
                                  <span className="mt-1.5 block text-right text-[9.5px] font-medium text-white/65 group-hover:text-white/90">
                                    Open full reply
                                  </span>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>

                      {showLegacyReview && (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-gray-400">
                              {thread.platform === 'reddit' ? (
                                <RedditIcon className="h-[18px] w-[18px] shrink-0 text-[#FF4500]" />
                              ) : thread.platform === 'x' ? (
                                <XIcon className="h-[18px] w-[18px] shrink-0 text-[#0F1419]" />
                              ) : (
                                <BlueskyIcon className="h-[18px] w-[18px] shrink-0 text-[#1185FE]" />
                              )}
                              <span className="font-semibold text-gray-700">
                                {isReddit ? `r/${thread.target}` : thread.target}
                              </span>
                              <span aria-hidden="true">&middot;</span>
                              <span>{thread.timeAgo}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {getSafeThreadUrl(thread) && (
                                <a
                                  href={getSafeThreadUrl(thread) ?? undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#0A84FF] transition-colors hover:bg-blue-50"
                                >
                                  Open post <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDraft(null)
                                  setSelectedThread(null)
                                }}
                                className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                aria-label="Close conversation"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="min-h-[250px] space-y-7 border-y border-black/[0.05] py-5 sm:px-2 sm:py-6">
                            <div className="flex justify-start">
                              <div className="w-fit max-w-[88%] rounded-[18px] rounded-bl-md border border-black/[0.04] bg-[#F1F1EF] px-3.5 py-3 sm:max-w-[68%]">
                                {thread.title && (
                                  <h3 className="mb-1 line-clamp-1 text-[13px] font-semibold leading-snug text-gray-900">
                                    {thread.title}
                                  </h3>
                                )}
                                <p className="line-clamp-2 text-[12.5px] leading-relaxed text-gray-600">
                                  {thread.content}
                                </p>
                                <p className="mt-1.5 text-right text-[10px] font-medium text-gray-400">
                                  {thread.timeAgo}
                                </p>
                              </div>
                            </div>

                            {editingDraft === thread.id ? (
                              <div className="ml-auto w-full max-w-[92%] sm:max-w-[76%]">
                                <div className="mb-2 flex items-center justify-between px-1">
                                  <span className="text-[11px] font-semibold text-gray-500">Your reply</span>
                                  <button
                                    type="button"
                                    onClick={() => setEditingDraft(null)}
                                    className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#0A84FF] transition-colors hover:bg-blue-50"
                                  >
                                    Done
                                  </button>
                                </div>
                                <div className="rounded-[20px] rounded-br-md bg-[#0A84FF] p-1 shadow-[0_4px_18px_rgba(10,132,255,0.16)]">
                                  <textarea
                                    className="min-h-[220px] w-full resize-none rounded-[16px] bg-white p-4 text-[13px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-white/60"
                                    value={thread.draft || ''}
                                    placeholder="Write your reply..."
                                    onChange={(event) => {
                                      const updated = event.target.value
                                      setThreads(prev => prev.map(item => item.id === thread.id ? { ...item, draft: updated } : item))
                                      setSelectedThread(prev => prev?.id === thread.id ? { ...prev, draft: updated } : prev)
                                    }}
                                    autoFocus
                                    spellCheck
                                  />
                                </div>
                                <p className="mt-1.5 px-1 text-right text-[10.5px] tabular-nums text-gray-400">
                                  {(thread.draft || '').length} characters
                                </p>
                              </div>
                            ) : (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => thread.draft ? setEditingDraft(thread.id) : void handleRegenerate()}
                                  disabled={regenerating}
                                  className="group w-fit max-w-[84%] rounded-[20px] rounded-br-md bg-[#0A84FF] px-4 py-3 text-left text-white shadow-[0_4px_18px_rgba(10,132,255,0.16)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 focus-visible:ring-offset-2 disabled:cursor-wait disabled:hover:translate-y-0 disabled:opacity-75 sm:max-w-[64%]"
                                  aria-label={thread.draft ? 'Open full drafted reply' : 'Generate a drafted reply'}
                                >
                                  {thread.draft ? (
                                    <p className="line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-white">
                                      {thread.draft}
                                    </p>
                                  ) : (
                                    <p className="text-[13px] font-semibold leading-relaxed text-white">
                                      {regenerating ? 'Preparing reply...' : 'Generate reply'}
                                    </p>
                                  )}
                                  <div className="mt-2 flex items-center justify-end gap-2 text-[10px] font-medium text-white/65">
                                    <span>{thread.draft ? 'Draft' : 'Not generated'}</span>
                                    <span aria-hidden="true">&middot;</span>
                                    <span className="group-hover:text-white/90">
                                      {thread.draft ? 'Open full reply' : 'Create preview'}
                                    </span>
                                  </div>
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex flex-col gap-3">
                            <button
                              type="button"
                              onClick={handleApproveAndSend}
                              disabled={!thread.draft || sendingThreadId === thread.id}
                              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:border disabled:border-gray-200/60 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              <CheckCircle className="h-4 w-4" />
                              {sendingThreadId === thread.id
                                ? (thread.platform === 'reddit' ? 'Preparing...' : 'Posting...')
                                : getDeliveryActionLabel(thread.platform, extensionInstalled)}
                            </button>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void handleDismiss()}
                                  className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                  title="Dismiss thread"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleRegenerate}
                                  disabled={regenerating}
                                  className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                                  title={thread.draft ? 'Rewrite reply' : 'Generate reply'}
                                >
                                  <RefreshCcw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleCopyDraft}
                                  disabled={!thread.draft}
                                  className="flex items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
                                >
                                  <Copy className="h-3.5 w-3.5 text-gray-400" />
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  onClick={handleMarkAsPosted}
                                  className="rounded-xl border border-gray-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                                >
                                  Mark as Posted
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {signalLimitReached && (
                  <div className="rounded-2xl p-6 bg-surface border border-black/5 shadow-sm text-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-white/90 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                      <div className="bg-black/5 p-3 rounded-full mb-3">
                        <Lock className="w-5 h-5 text-gray-700" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">
                        Starter signal limit reached
                      </h3>
                      <p className="text-[13px] text-gray-500 mb-4 max-w-[260px]">
                        Add 100 more monitored signals for this month without changing plans.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleBuyAddon('signals')}
                        disabled={Boolean(openingAddonCheckout)}
                        className="px-5 py-2 rounded-lg bg-[#0A84FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors shadow-[0_0_20px_rgba(10,132,255,0.2)] disabled:opacity-60"
                      >
                        {openingAddonCheckout === 'signals' ? 'Opening...' : BILLING_ADDONS.signals.ctaLabel}
                      </button>
                    </div>

                    {/* Dummy blurred content behind */}
                    <div className="opacity-20 blur-[3px] select-none pointer-events-none">
                      <div className="h-4 bg-gray-200 rounded w-1/4 mb-3" />
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-4 bg-gray-200 rounded w-2/3" />
                    </div>
                  </div>
                )}
              </div>

              {/* Retained temporarily for checkpoint compatibility; the inline conversation is the active review surface. */}
              {selectedThread && (
                <div className="hidden" aria-hidden="true">
                  <button
                    type="button"
                    className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] xl:hidden"
                    onClick={() => setSelectedThread(null)}
                    aria-label="Close review panel"
                  />
                  <div className="fixed inset-x-3 bottom-[76px] top-[72px] z-40 flex w-auto shrink-0 flex-col overflow-hidden rounded-3xl border border-black/[0.08] bg-white shadow-xl transition-all xl:sticky xl:inset-auto xl:top-[80px] xl:z-auto xl:max-h-[calc(100vh-96px)] xl:w-[46%] xl:max-w-[520px] xl:shadow-lg">
                    {/* Panel Header */}
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] bg-white px-4 py-4 sm:px-6">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {selectedThread.platform === 'reddit' ? (
                          <RedditIcon className="h-5 w-5 shrink-0 text-[#FF4500]" />
                        ) : selectedThread.platform === 'x' ? (
                          <XIcon className="h-5 w-5 shrink-0 text-[#0F1419]" />
                        ) : (
                          <BlueskyIcon className="h-5 w-5 shrink-0 text-[#1185FE]" />
                        )}
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold tracking-tight text-gray-900">Conversation</h2>
                          <span className="block truncate text-[11px] font-medium text-gray-400">
                            {selectedThread.platform === 'reddit' ? `r/${selectedThread.target}` : selectedThread.target}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {getSafeThreadUrl(selectedThread) ? (
                          <a
                            href={getSafeThreadUrl(selectedThread) ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#0A84FF] transition-colors hover:bg-blue-50 hover:text-blue-700"
                          >
                            Open post <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
                            Open post <ExternalLink className="h-3 w-3" />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedThread(null)}
                          className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 xl:hidden"
                          aria-label="Close review panel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Staggered conversation body */}
                    <div className="flex-1 space-y-5 overflow-y-visible px-4 py-5 sm:px-6 xl:overflow-y-auto">
                      <div className="flex justify-start">
                        <div className="w-fit max-w-[82%] rounded-[18px] rounded-bl-md border border-black/[0.04] bg-[#F1F1EF] px-3.5 py-3">
                          <div className="mb-2 flex items-center gap-2 text-[10.5px] font-medium text-gray-400">
                            {selectedThread.platform === 'reddit' ? (
                              <RedditIcon className="h-3.5 w-3.5 text-[#FF4500]" />
                            ) : selectedThread.platform === 'x' ? (
                              <XIcon className="h-3.5 w-3.5 text-[#0F1419]" />
                            ) : (
                              <BlueskyIcon className="h-3.5 w-3.5 text-[#1185FE]" />
                            )}
                            <span>{selectedThread.platform === 'reddit' ? `r/${selectedThread.target}` : selectedThread.target}</span>
                          </div>
                          {selectedThread.title && (
                            <h3 className="mb-1 line-clamp-1 text-[13px] font-semibold leading-snug text-gray-900">
                              {selectedThread.title}
                            </h3>
                          )}
                          <p className="line-clamp-2 text-[12.5px] font-normal leading-relaxed text-gray-600">
                            {selectedThread.content}
                          </p>
                          <p className="mt-1.5 text-right text-[10px] font-medium text-gray-400">
                            {selectedThread.timeAgo}
                          </p>
                        </div>
                      </div>

                      {editingDraft === selectedThread.id ? (
                        <div className="ml-auto w-full max-w-[92%]">
                          <div className="mb-2 flex items-center justify-between px-1">
                            <span className="text-[11px] font-semibold text-gray-500">Your reply</span>
                            <button
                              type="button"
                              onClick={() => setEditingDraft(null)}
                              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#0A84FF] transition-colors hover:bg-blue-50"
                            >
                              Done
                            </button>
                          </div>
                          <div className="rounded-[20px] rounded-br-md bg-[#0A84FF] p-1 shadow-[0_4px_18px_rgba(10,132,255,0.16)]">
                            <textarea
                              className="min-h-[220px] w-full resize-none rounded-[16px] bg-white p-4 text-[13px] font-normal leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-white/60"
                              value={selectedThread.draft || ''}
                              placeholder="Write your reply..."
                              onChange={(e) => {
                                const updated = e.target.value
                                setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, draft: updated } : t))
                                setSelectedThread(prev => prev ? { ...prev, draft: updated } : null)
                              }}
                              autoFocus
                              spellCheck
                            />
                          </div>
                          <p className="mt-1.5 px-1 text-right text-[10.5px] tabular-nums text-gray-400">
                            {(selectedThread.draft || '').length} characters
                          </p>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => selectedThread.draft ? setEditingDraft(selectedThread.id) : void handleRegenerate()}
                            disabled={regenerating}
                            className="group w-fit max-w-[84%] rounded-[20px] rounded-br-md bg-[#0A84FF] px-4 py-3 text-left text-white shadow-[0_4px_18px_rgba(10,132,255,0.16)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 focus-visible:ring-offset-2 disabled:cursor-wait disabled:hover:translate-y-0 disabled:opacity-75"
                            aria-label={selectedThread.draft ? 'Open full drafted reply' : 'Generate a drafted reply'}
                          >
                            {selectedThread.draft ? (
                              <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-relaxed text-white">
                                {selectedThread.draft}
                              </p>
                            ) : (
                              <p className="text-[13px] font-semibold leading-relaxed text-white">
                                {regenerating ? 'Preparing reply...' : 'Generate reply'}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-end gap-2 text-[10px] font-medium text-white/65">
                              <span>{selectedThread.draft ? 'Draft' : 'Not generated'}</span>
                              <span aria-hidden="true">&middot;</span>
                              <span className="group-hover:text-white/90">
                                {selectedThread.draft ? 'Open full reply' : 'Create preview'}
                              </span>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Panel Footer & Action Bar */}
                    <div className="p-5 bg-white border-t border-gray-100 flex flex-col gap-3 shrink-0">
                      <button
                        onClick={handleApproveAndSend}
                        disabled={!selectedThread.draft || sendingThreadId === selectedThread.id}
                        className="w-full py-3 rounded-2xl bg-gray-900 hover:bg-black text-white font-semibold text-xs disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200/60 shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4 text-white" />
                        {sendingThreadId === selectedThread.id
                          ? (selectedThread.platform === 'reddit' ? 'Preparing...' : 'Posting...')
                          : getDeliveryActionLabel(selectedThread.platform, extensionInstalled)}
                      </button>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => void handleDismiss()}
                            className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all cursor-pointer"
                            title="Dismiss thread"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleRegenerate}
                            disabled={regenerating}
                            className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all disabled:opacity-40 cursor-pointer"
                            title={selectedThread.draft ? 'Rewrite reply' : 'Generate reply'}
                          >
                            <RefreshCcw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleCopyDraft}
                            className="px-3 py-1.5 rounded-xl border border-gray-200/80 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <Copy className="w-3.5 h-3.5 text-gray-400" />
                            Copy
                          </button>
                          <button
                            onClick={handleMarkAsPosted}
                            className="px-3 py-1.5 rounded-xl border border-gray-200/80 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer shadow-2xs"
                          >
                            Mark as Posted
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )
      })()}

      {/* Floating Bottom-Left Onboarding Checklist Widget */}
    </div>
  )
}
