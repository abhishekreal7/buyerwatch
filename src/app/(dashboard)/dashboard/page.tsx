'use client'

import { useState, useEffect } from 'react'
import { Search, Target, CheckCircle, ChevronDown, MessageCircle, ExternalLink, X, RefreshCcw, Copy, FileText, Lock, Sparkles, ChevronUp, Globe } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { UpgradeModal } from '@/components/UpgradeModal'
import { GettingStartedChecklist } from '@/components/GettingStartedChecklist'
import { BlueskyIcon, RedditIcon } from '@/components/Icons'
import { PageHeader } from '@/components/PageHeader'
import { getPlanLimits } from '@/lib/plan-limits'
import { useDashboardSession } from '@/components/DashboardContext'
import { getIntentDisplayLabel, type IntentLabel } from '@/lib/intent'

interface Thread {
  id: string
  platform: string
  target: string
  timeAgo: string
  title: string
  content: string
  score: number
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

export default function DashboardPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [totalSent, setTotalSent] = useState(0)
  const [plan, setPlan] = useState('free')
  const [regenerating, setRegenerating] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'high-intent' | 'dismissed'>('all')
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null) // Feature 1
  const [communityHealth, setCommunityHealth] = useState<Record<string, { rejection_rate: number; total_engagements: number }>>({}) // Feature 3
  const [editingDraft, setEditingDraft] = useState<string | null>(null) // Feature 4: inline draft edit
  const [stats, setStats] = useState({
    threadsFound: 0,
    highIntent: 0,
    draftsReady: 0,
    postedToday: 0,
    trend: '+0 today',
  })
  const [keywordsCount, setKeywordsCount] = useState(0)
  const [keywordsMax, setKeywordsMax] = useState(1)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [hasInspectedLead, setHasInspectedLead] = useState(false)
  const [hasCopiedOrApproved, setHasCopiedOrApproved] = useState(false)
  const [autoSendEnabled, setAutoSendEnabled] = useState(false)
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()

  async function loadData() {
    const [
      profileResult,
      keywordsCountResult,
      feedbackCountResult,
      threadsResult,
      allThreadsResult,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('plan, auto_send_enabled')
        .eq('id', userId)
        .single(),
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
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('monitored_threads')
        .select('status, intent_score, created_at')
        .eq('user_id', userId),
    ])

    const profile = profileResult.data
    if (profile?.plan) {
      setPlan(profile.plan)
      setKeywordsMax(getPlanLimits(profile.plan).keywords)
    }
    setAutoSendEnabled(profile?.auto_send_enabled ?? false)

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

    const parsed: Thread[] = (threadData || []).map(t => ({
      id: t.id,
      platform: t.platform,
      target: (t.keywords as unknown as { target?: string })?.target || t.platform,
      timeAgo: formatTimeAgo(t.created_at),
      title: t.title || '',
      content: t.text_content || '',
      score: Number(t.intent_score) || 0,
      label: getIntentDisplayLabel(
        t.intent_label as IntentLabel | undefined,
        Number(t.intent_score) || 0,
      ),
      matchedKeyword: (t.keywords as unknown as { term?: string })?.term || '',
      draft: (t.reply_analytics as unknown as { draft_text?: string }[])?.[0]?.draft_text || '',
      originalDraft: (t.reply_analytics as unknown as { draft_text?: string }[])?.[0]?.draft_text || '',
      url: t.url || null,
      flag: t.flag || undefined,
      reasoning: (t as any).score_reasoning || undefined,        // Feature 1
      googleRanked: (t as any).google_rank_position > 0,        // Feature 5
      createdAt: t.created_at,                                   // Feature 4
      status: t.status || 'pending',
      reviewedAt: t.reviewed_at || null,
    }))

    setThreads(parsed)
    setHasInspectedLead(parsed.some(thread => Boolean(thread.reviewedAt)))
    const activeParsed = parsed.filter(t => t.status !== 'dismissed')
    if (activeParsed.length > 0) {
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

    // Compute stats
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const allThreads = allThreadsResult.data

    if (allThreads) {
      const todayThreads = allThreads.filter(t => new Date(t.created_at) >= today)
      const postedToday = allThreads.filter(t => t.status === 'replied' && new Date(t.created_at) >= today).length
      const totalPosted = allThreads.filter(t => t.status === 'replied').length
      setTotalSent(totalPosted)

      const drafted = allThreads.filter(t => t.status === 'drafted').length
      const highIntent = allThreads.filter(t =>
        ['pending', 'drafted', 'needs_manual_reply'].includes(t.status) &&
        Number(t.intent_score) >= 80
      ).length

      setStats({
        threadsFound: allThreads.filter(t => ['pending', 'drafted', 'needs_manual_reply'].includes(t.status)).length,
        highIntent,
        draftsReady: drafted,
        postedToday,
        trend: `+${todayThreads.length} today`,
      })
    }

    setLoading(false)
  }

  useEffect(() => {

    loadData()
  }, [])

  useEffect(() => {
    const handleAutoSendChanged = (event: Event) => {
      setAutoSendEnabled(Boolean((event as CustomEvent<boolean>).detail))
    }
    window.addEventListener('scouto:auto-send-changed', handleAutoSendChanged)
    return () => window.removeEventListener('scouto:auto-send-changed', handleAutoSendChanged)
  }, [])

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
    if (!selectedThread || !selectedThread.draft) return

    // Call the actual API endpoint
    try {
      const res = await fetch('/api/replies/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: selectedThread.id,
          text: selectedThread.draft,
          platform: selectedThread.platform
        })
      })
      if (!res.ok) throw new Error('Failed to queue reply')

      const actionType = selectedThread.originalDraft === selectedThread.draft
        ? 'APPROVED'
        : 'EDITED_APPROVED'
      const feedbackResponse = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: selectedThread.id,
          originalDraft: selectedThread.originalDraft,
          finalDraft: selectedThread.draft,
          actionType,
          platform: selectedThread.platform,
          targetCommunity: selectedThread.target,
          keywordCluster: selectedThread.matchedKeyword,
        }),
      })
      if (!feedbackResponse.ok) {
        toast.warning('Reply queued, but review history could not be updated.')
      } else {
        setHasCopiedOrApproved(true)
      }
    } catch {
      toast.error('Failed to send reply')
      return
    }

    // Optimistic UI update
    setThreads(prev => prev.filter(t => t.id !== selectedThread.id))
    setSelectedThread(threads.find(t => t.id !== selectedThread.id) || null)

    if (totalSent === 0) {
      toast.success("First reply sent! You're officially monitoring the internet on autopilot.", {
        duration: 5000,
        icon: '🎉'
      })
    } else {
      toast.success('Reply queued for sending.')
    }

    setTotalSent(prev => prev + 1)
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

  const handleDismiss = async () => {
    if (!selectedThread) return
    const dismissed = selectedThread
    setThreads(prev => prev.filter(t => t.id !== dismissed.id))
    setSelectedThread(threads.find(t => t.id !== dismissed.id) || null)
    toast.success('Thread dismissed')
    supabase.from('monitored_threads').update({ status: 'dismissed' }).eq('id', dismissed.id).then()
  }

  const handleMarkAsPosted = async () => {
    if (!selectedThread) return
    const thread = selectedThread
    setThreads(prev => prev.filter(t => t.id !== thread.id))
    setSelectedThread(threads.find(t => t.id !== thread.id) || null)
    toast.success('Marked as posted')
    await supabase.from('monitored_threads').update({ status: 'replied' }).eq('id', thread.id)
    setStats(prev => ({ ...prev, postedToday: prev.postedToday + 1 }))
    setTotalSent(prev => prev + 1)
  }

  const handleRegenerate = async () => {
    if (!selectedThread || regenerating) return
    setRegenerating(true)
    toast.info('Regenerating draft…')
    try {
      const res = await fetch('/api/replies/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: selectedThread.id })
      })
      if (!res.ok) throw new Error()

      const { draft } = await res.json()

      // Also log feedback in background
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: selectedThread.id,
          originalDraft: selectedThread.draft,
          finalDraft: draft,
          actionType: 'REGENERATE_REQUESTED',
          platform: selectedThread.platform,
          targetCommunity: selectedThread.target,
          keywordCluster: selectedThread.matchedKeyword,
        }),
      }).catch(console.error)

      setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, draft, originalDraft: draft } : t))
      setSelectedThread(prev => prev ? { ...prev, draft, originalDraft: draft } : null)
      window.dispatchEvent(new Event('scouto:credits-changed'))
      toast.success('Draft regenerated.')
    } catch {
      toast.error('Failed to request regeneration')
    } finally {
      setRegenerating(false)
    }
  }

  const filtered = filterTab === 'dismissed'
    ? threads.filter(t => t.status === 'dismissed')
    : filterTab === 'high-intent'
    ? threads.filter(t => t.status !== 'dismissed' && t.score >= 80)
    : threads.filter(t => t.status !== 'dismissed')

  useEffect(() => {
    if (selectedThread && !filtered.some(t => t.id === selectedThread.id)) {
      setSelectedThread(null)
    }
  }, [filterTab, threads])

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
          <a
            href="/keywords"
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-gray-800 sm:min-h-0"
          >
            <Target className="w-3.5 h-3.5" strokeWidth={2.2} />
            + Add Keyword
          </a>
        )}
      />

      {/* ElevenLabs Style 4 Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Conversations Found */}
        <div className="relative rounded-2xl border border-[#E3E3E0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.055)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-semibold text-[#4F5865]">Conversations Found</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0A84FF] flex items-center justify-center shrink-0">
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
            <span className="text-[12.5px] font-semibold text-[#4F5865]">High Intent</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" strokeWidth={2} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900 tracking-tight">
              {loading ? '—' : stats.highIntent}
            </span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
              ↑ {stats.trend}
            </span>
          </div>
        </div>

        {/* Metric 3: Drafts Ready */}
        <div className="rounded-2xl border border-[#E3E3E0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.055)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-semibold text-[#4F5865]">Drafts Ready</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0A84FF] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" strokeWidth={2} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900 tracking-tight">
              {loading ? '—' : stats.draftsReady}
            </span>
            <span className="text-[11.5px] font-medium text-[#667085]">
              {stats.draftsReady > 0 ? 'Review Now →' : 'Up to date'}
            </span>
          </div>
        </div>

        {/* Metric 4: Posted Today */}
        <div className="rounded-2xl border border-[#E3E3E0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.055)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-semibold text-[#4F5865]">Posted Today</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <CheckCircle className="w-4 h-4" strokeWidth={2} />
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
      {!loading && plan === 'free' && keywordsCount >= 1 && stats.highIntent > 0 && !bannerDismissed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3.5 shadow-2xs sm:flex-row sm:items-center sm:px-5">
          <Sparkles className="w-5 h-5 text-amber-500 shrink-0" strokeWidth={1.75} />
          <p className="flex-1 text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">{stats.highIntent} high-intent conversation{stats.highIntent !== 1 ? 's' : ''} found</span>{' '}
            this month with your current keyword. Upgrade to Professional to add 9 more topics.
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

      {/* Filtered threads calculation */}
      {(() => {
        const filtered = threads.filter(t => {
          if (filterTab === 'high-intent') return t.score >= 80 && t.status !== 'dismissed'
          if (filterTab === 'dismissed') return t.status === 'dismissed'
          return t.status !== 'dismissed'
        })
        const dismissedCount = threads.filter(t => t.status === 'dismissed').length

        return (
          <>
            {/* ElevenLabs Style Filters & Pill Navigation Bar */}
            <div className="bg-white rounded-2xl border border-[#E3E3E0] p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.055)] flex items-center justify-between flex-wrap gap-3">
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
                  High Intent (≥80%)
                </button>
                <button
                  onClick={() => setFilterTab('dismissed')}
                  className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer sm:min-h-0 ${filterTab === 'dismissed' ? 'bg-white shadow-xs text-gray-950' : 'text-[#4F5865] hover:text-gray-950'}`}
                >
                  <span>Dismissed</span>
                  {dismissedCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-gray-200 text-gray-700">
                      {dismissedCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-[#4F5865] pr-1">
                <span>{filtered.length === 1 ? '1 opportunity' : `${filtered.length} opportunities`}</span>
              </div>
            </div>

            {/* Main Feed & Detail Two Column Section */}
            <div className="flex flex-col items-start gap-6 xl:flex-row">
              {/* Left Column (Feed) */}
              <div className="flex-1 space-y-4">
              {loading && (
                <div className="rounded-2xl p-12 bg-white border border-[#E3E3E0] shadow-xs flex items-center justify-center text-[#667085] text-xs font-medium">
                  Loading opportunities...
                </div>
              )}

              {!loading && filtered.length === 0 && keywordsCount === 0 && (
                /* ── No keywords yet — onboarding CTA ── */
                <div className="rounded-2xl bg-white border border-black/[0.06] p-10 shadow-xs text-center flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#0A84FF] flex items-center justify-center border border-blue-100">
                    <Search className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Your signal radar is idle</h3>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm">
                      Add your first keyword to start scanning Reddit &amp; social communities for prospective buyers.
                    </p>
                  </div>
                  <a
                    href="/keywords"
                    className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors shadow-xs"
                  >
                    <Target className="w-3.5 h-3.5" strokeWidth={2} />
                    Add first keyword
                  </a>
                </div>
              )}

              {!loading && filtered.length === 0 && keywordsCount > 0 && (
                /* ── ElevenLabs Style Clean Empty State ── */
                <div className="rounded-2xl bg-white border border-[#E3E3E0] p-10 shadow-[0_1px_2px_rgba(0,0,0,0.055)] flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#F8F9FA] border border-[#DEE2E6] flex items-center justify-center text-[#667085]">
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
                    className="px-3.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer mt-1"
                  >
                    <RefreshCcw className="w-3.5 h-3.5 text-gray-400" />
                    Check now
                  </button>
                </div>
              )}


                {filtered.map((thread) => {
                  const isSelected = selectedThread?.id === thread.id
                  const isReddit = thread.platform === 'reddit'

                  return (
                    <article
                      key={thread.id}
                      onClick={() => handleInspectThread(thread)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleInspectThread(thread)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      className={`rounded-2xl p-5 bg-white cursor-pointer transition-all ${isSelected
                        ? 'border-2 border-[#0A84FF] shadow-sm'
                        : 'border border-black/5 hover:border-black/15 focus-visible:border-[#0A84FF]'
                        }`}
                    >
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-text-secondary">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F4F5F7]">
                            {isReddit ? (
                              <>
                                <RedditIcon className="h-[18px] w-[18px] text-[#FF4500]" />
                                <span className="font-medium text-text-secondary text-[13px] tracking-tight">Reddit</span>
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
                        {/* Feature 5: Google Ranked badge */}
                        {thread.googleRanked && (
                          <span className="flex items-center gap-1 rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            <Globe className="w-3 h-3" />
                            Google Ranked
                          </span>
                        )}
                      </div>

                      {thread.title && <h3 className="text-[15px] font-bold text-text-primary mb-2 leading-snug">{thread.title}</h3>}
                      <p className="text-text-secondary text-[14px] line-clamp-2 mb-4 leading-relaxed">{thread.content}</p>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                          {thread.flag === 'COMPETITOR_RISK' ? (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1.5 bg-red-100 text-red-700 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)]">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              Competitor Risk
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1.5 ${thread.score >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-[#e2e4e9] text-text-secondary'}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${thread.score >= 80 ? 'bg-emerald-500' : 'bg-text-tertiary'}`} />
                              {thread.score} · {thread.label}
                            </span>
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
                          {thread.draft && (
                            <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded">Draft ready</span>
                          )}
                        </div>
                      </div>

                      {/* Feature 1: Signal Trace — collapsible reasoning panel */}
                      {thread.reasoning && (
                        <div className="mt-3 border-t border-black/5 pt-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedTrace(expandedTrace === thread.id ? null : thread.id) }}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-text-tertiary hover:text-text-secondary transition-colors uppercase tracking-wide"
                          >
                            {expandedTrace === thread.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            Signal Trace
                          </button>
                          {expandedTrace === thread.id && (
                            <div className="mt-2 bg-[#F8F9FA] rounded-lg px-3 py-2.5 border border-black/5">
                              <p className="text-[12px] text-text-secondary leading-relaxed italic">&ldquo;{thread.reasoning}&rdquo;</p>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}

                {plan === 'free' && stats.threadsFound > 10 && (
                  <div className="rounded-2xl p-6 bg-surface border border-black/5 shadow-sm text-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-white/90 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                      <div className="bg-black/5 p-3 rounded-full mb-3">
                        <Lock className="w-5 h-5 text-gray-700" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {stats.threadsFound - 10} more high-intent threads waiting
                      </h3>
                      <p className="text-[13px] text-gray-500 mb-4 max-w-[260px]">
                        You&apos;ve reached the free tier limit. Upgrade to unlock all conversations.
                      </p>
                      <a href="/settings" className="px-5 py-2 rounded-lg bg-[#0A84FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors shadow-[0_0_20px_rgba(10,132,255,0.2)]">
                        Upgrade to Pro
                      </a>
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

              {/* Right Column (Review & Post Detail Panel) */}
              {selectedThread && (
                <>
                <button
                  type="button"
                  className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] xl:hidden"
                  onClick={() => setSelectedThread(null)}
                  aria-label="Close review panel"
                />
                <div className="fixed inset-x-3 bottom-[76px] top-[72px] z-40 flex w-auto shrink-0 flex-col overflow-hidden rounded-3xl border border-black/[0.08] bg-white shadow-xl transition-all xl:sticky xl:inset-auto xl:top-[80px] xl:z-auto xl:max-h-[calc(100vh-96px)] xl:w-[46%] xl:max-w-[520px] xl:shadow-lg">
                  {/* Panel Header */}
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0A84FF] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" strokeWidth={2} />
                      </div>
                      <div>
                        <h2 className="font-bold text-gray-900 text-sm tracking-tight">Review &amp; Post</h2>
                        <span className="text-[11px] font-medium text-gray-400">
                          {selectedThread.platform === 'reddit' ? `r/${selectedThread.target}` : selectedThread.target}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                    {selectedThread.url ? (
                      <a
                        href={selectedThread.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-[#0A84FF] hover:text-blue-700 flex items-center gap-1 bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-xl transition-all"
                      >
                        Open Thread <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
                        Open Thread <ExternalLink className="w-3 h-3" />
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

                  {/* Panel Body Scrollable Content */}
                  <div className="flex-1 space-y-6 overflow-y-visible p-4 sm:p-6 xl:overflow-y-auto">
                    {/* Original Post Preview */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <MessageCircle className="w-3.5 h-3.5 text-gray-400" />
                          Original Post Preview
                        </span>
                      </div>

                      <div className="bg-gray-50/80 border border-gray-200/70 rounded-2xl p-4 space-y-2">
                        {selectedThread.title && (
                          <h3 className="text-xs font-bold text-gray-900 leading-snug">
                            {selectedThread.title}
                          </h3>
                        )}
                        <p className="text-xs text-gray-600 leading-relaxed font-normal">
                          {selectedThread.content}
                        </p>
                      </div>
                    </div>

                    {/* AI Draft Reply Section */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#0A84FF]" strokeWidth={2} />
                          <span className="text-[11px] font-bold text-gray-900 uppercase tracking-wider">
                            AI Draft Reply
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedThread.draft && (
                            <button
                              onClick={() => setEditingDraft(editingDraft === selectedThread.id ? null : selectedThread.id)}
                              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border transition-all cursor-pointer ${editingDraft === selectedThread.id
                                  ? 'bg-gray-900 text-white border-gray-900 shadow-2xs'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                              {editingDraft === selectedThread.id ? 'Done editing' : 'Edit Draft'}
                            </button>
                          )}
                          <span className="text-[11px] text-gray-400 font-medium">
                            {(selectedThread.draft || '').length} chars
                          </span>
                        </div>
                      </div>

                      <div className="bg-white border border-[#0A84FF]/30 focus-within:border-[#0A84FF] focus-within:ring-4 focus-within:ring-[#0A84FF]/10 rounded-2xl shadow-2xs transition-all overflow-hidden">
                        {editingDraft === selectedThread.id ? (
                          <textarea
                            className="w-full p-4 text-xs text-gray-900 leading-relaxed resize-none outline-none bg-transparent min-h-[160px] font-normal"
                            value={selectedThread.draft || ''}
                            onChange={(e) => {
                              const updated = e.target.value
                              setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, draft: updated } : t))
                              setSelectedThread(prev => prev ? { ...prev, draft: updated } : null)
                            }}
                            autoFocus
                            spellCheck
                          />
                        ) : (
                          <div className="p-4">
                            {selectedThread.draft ? (
                              selectedThread.draft.split('\n\n').map((paragraph, i) => (
                                <p key={i} className="text-xs text-gray-800 leading-relaxed mb-3 last:mb-0 font-normal">
                                  {paragraph}
                                </p>
                              ))
                            ) : (
                              <p className="text-xs text-gray-400 italic">
                                No draft generated yet. The AI will draft a reply once the thread is processed.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Panel Footer & Action Bar */}
                  <div className="p-5 bg-white border-t border-gray-100 flex flex-col gap-3 shrink-0">
                    <button
                      onClick={handleApproveAndSend}
                      disabled={!selectedThread.draft}
                      className="w-full py-3 rounded-2xl bg-gray-900 hover:bg-black text-white font-semibold text-xs disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200/60 shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4 text-white" />
                      Approve &amp; Send Reply
                    </button>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleDismiss}
                          className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all cursor-pointer"
                          title="Dismiss thread"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleRegenerate}
                          disabled={regenerating}
                          className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all disabled:opacity-40 cursor-pointer"
                          title="Regenerate AI draft"
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
                </>
              )}
            </div>
          </>
        )
      })()}

      {/* Floating Bottom-Left Onboarding Checklist Widget */}
      <GettingStartedChecklist
        keywordsCount={keywordsCount}
        hasInspectedLead={hasInspectedLead}
        hasCopiedOrApproved={hasCopiedOrApproved}
        autoSendEnabled={autoSendEnabled}
      />
    </div>
  )
}
