'use client'

import { useState, useEffect } from 'react'
import { Search, Target, Edit3, CheckCircle, Filter, ChevronDown, MessageCircle, ArrowUp, ExternalLink, X, RefreshCcw, Copy, ArrowRight, FileText, Lock } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

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
  url: string | null
  flag?: string
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

export default function DashboardPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [totalSent, setTotalSent] = useState(0)
  const [plan, setPlan] = useState('free')
  const [regenerating, setRegenerating] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'high-intent'>('all')
  const [stats, setStats] = useState({
    threadsFound: 0,
    highIntent: 0,
    draftsReady: 0,
    postedToday: 0,
    trend: '+0 today',
  })
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
    if (profile?.plan) {
      setPlan(profile.plan)
    }

    // Load threads with their drafts
    const { data: threadData, error } = await supabase
      .from('monitored_threads')
      .select('*, reply_analytics(draft_text), keywords(term, target)')
      .eq('user_id', user.id)
      .in('status', ['pending', 'drafted', 'needs_manual_reply'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      toast.error('Failed to load threads')
      setLoading(false)
      return
    }

    const parsed: Thread[] = (threadData || []).map(t => ({
      id: t.id,
      platform: t.platform,
      target: (t.keywords as any)?.target || t.platform,
      timeAgo: formatTimeAgo(t.created_at),
      title: '',
      content: t.text_content || '',
      score: Number(t.intent_score) || 0,
      label: Number(t.intent_score) >= 80 ? 'Buying' : Number(t.intent_score) >= 60 ? 'Exploring' : 'Researching',
      matchedKeyword: (t.keywords as any)?.term || '',
      draft: (t.reply_analytics as any)?.[0]?.draft_text || '',
      url: t.url || null,
      flag: t.flag || undefined,
    }))

    setThreads(parsed)
    if (parsed.length > 0) {
      setSelectedThread(parsed[0])
    }

    // Compute stats
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: allThreads } = await supabase
      .from('monitored_threads')
      .select('status, intent_score, created_at')
      .eq('user_id', user.id)

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
    } catch (err) {
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

      setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, draft } : t))
      setSelectedThread(prev => prev ? { ...prev, draft } : null)
      toast.success('Draft regenerated.')
    } catch {
      toast.error('Failed to request regeneration')
    } finally {
      setRegenerating(false)
    }
  }

  const filtered = filterTab === 'high-intent'
    ? threads.filter(t => t.score >= 80)
    : threads

  return (
    <div className="max-w-[1400px] mx-auto py-8">

      {/* Stats Container */}
      <div className="bg-surface rounded-2xl border border-black/5 shadow-sm py-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-black/5">
          {/* Threads Found */}
          <div className="flex flex-col items-center justify-center py-2 md:py-0 relative group">
            <div className="text-[13px] font-medium text-text-secondary mb-1.5 flex items-center gap-1.5 cursor-help">
              Conversations Found
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block w-56 p-2.5 bg-gray-900 text-white text-[11px] rounded-lg shadow-xl z-50 text-center leading-relaxed">
                We found {stats.threadsFound} conversations where someone was actively looking for what you sell.
              </div>
            </div>
            <div className="text-[28px] font-bold text-text-primary leading-none tracking-tight mb-1.5">
              {loading ? '—' : stats.threadsFound}
            </div>
            <div className="text-[12px] font-medium text-text-tertiary">
              Pending review
            </div>
          </div>
          {/* High Intent */}
          <div className="flex flex-col items-center justify-center py-2 md:py-0">
            <div className="text-[13px] font-medium text-text-secondary mb-1.5">
              High Intent
            </div>
            <div className="text-[28px] font-bold text-text-primary leading-none tracking-tight mb-1.5">
              {loading ? '—' : stats.highIntent}
            </div>
            <div className="inline-flex items-center gap-1 bg-[#E8F8F0] text-[#0F9D58] px-2 py-0.5 rounded text-[12px] font-medium">
              ↑ {stats.trend}
            </div>
          </div>
          {/* Drafts Ready */}
          <div className="flex flex-col items-center justify-center py-2 md:py-0">
            <div className="text-[13px] font-medium text-text-secondary mb-1.5">
              Drafts Ready
            </div>
            <div className="text-[28px] font-bold text-text-primary leading-none tracking-tight mb-1.5">
              {loading ? '—' : stats.draftsReady}
            </div>
            <div className="text-[12px] font-medium text-text-tertiary">
              {stats.draftsReady > 0 ? 'Review Now →' : 'Up to date'}
            </div>
          </div>
          {/* Posted Today */}
          <div className="flex flex-col items-center justify-center py-2 md:py-0">
            <div className="text-[13px] font-medium text-text-secondary mb-1.5">
              Posted Today
            </div>
            <div className="text-[28px] font-bold text-text-primary leading-none tracking-tight mb-1.5">
              {loading ? '—' : stats.postedToday}
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Tabs */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex items-center bg-[#F8F9FA] p-1 rounded-full border border-black/5">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${filterTab === 'all' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilterTab('high-intent')}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${filterTab === 'high-intent' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            High Intent
          </button>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="flex items-start gap-6">
        {/* Left Column (Feed) */}
        <div className="flex-1 space-y-4">
          {loading && (
            <div className="rounded-2xl p-8 bg-surface border border-black/5 flex items-center justify-center text-text-secondary text-sm">
              Loading threads...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl p-10 bg-surface border border-black/5 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-text-primary font-semibold">No threads yet</p>
              <p className="text-text-secondary text-sm max-w-[280px]">
                Add keywords in Monitoring Rules and the system will start finding matching threads.
              </p>
            </div>
          )}

          {filtered.map((thread) => {
            const isSelected = selectedThread?.id === thread.id
            const isReddit = thread.platform === 'reddit'

            return (
              <div
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={`rounded-2xl p-5 bg-white cursor-pointer transition-all ${isSelected
                  ? 'border-2 border-[#0A84FF] shadow-sm'
                  : 'border border-black/5 hover:border-black/15'
                  }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F4F5F7]">
                      {isReddit ? (
                        <>
                          <img src="https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-57x57.png" alt="Reddit" className="w-[18px] h-[18px] rounded-full shadow-sm" />
                          <span className="font-medium text-text-secondary text-[13px] tracking-tight">Reddit</span>
                        </>
                      ) : (
                        <>
                          <img src="https://bsky.app/static/apple-touch-icon.png" alt="Bluesky" className="w-[18px] h-[18px] rounded-full shadow-sm" />
                          <span className="font-medium text-text-secondary text-[13px] tracking-tight">Bluesky</span>
                        </>
                      )}
                    </div>
                    <span>·</span>
                    <span className="font-medium text-text-primary">{isReddit ? `r/${thread.target}` : `"${thread.target}"`}</span>
                    <span className="ml-1 text-xs">{thread.timeAgo}</span>
                  </div>
                </div>

                {thread.title && <h3 className="text-[15px] font-bold text-text-primary mb-2 leading-snug">{thread.title}</h3>}
                <p className="text-text-secondary text-[14px] line-clamp-2 mb-4 leading-relaxed">{thread.content}</p>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-3">
                    {thread.flag === 'COMPETITOR_RISK' ? (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1.5 bg-red-100 text-red-700 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        Competitor Risk
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1.5 ${thread.label === 'Buying' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#e2e4e9] text-text-secondary'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${thread.label === 'Buying' ? 'bg-emerald-500' : 'bg-text-tertiary'}`} />
                        {thread.score} · {thread.label}
                      </span>
                    )}
                    {thread.matchedKeyword && (
                      <span className="text-xs text-text-tertiary font-medium tracking-wide">Matched: "{thread.matchedKeyword}"</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {thread.draft && (
                      <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded">Draft ready</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {plan === 'free' && stats.threadsFound > 50 && (
            <div className="rounded-2xl p-6 bg-surface border border-black/5 shadow-sm text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-white/90 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                <div className="bg-black/5 p-3 rounded-full mb-3">
                  <Lock className="w-5 h-5 text-gray-700" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  {stats.threadsFound - 50} more high-intent threads waiting
                </h3>
                <p className="text-[13px] text-gray-500 mb-4 max-w-[260px]">
                  You've reached the free tier limit. Upgrade to unlock all conversations.
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

        {/* Right Column (Review & Post) */}
        {selectedThread && (
          <div className="w-[540px] shrink-0 border border-black/10 rounded-xl bg-white flex flex-col overflow-hidden shadow-sm sticky top-[100px]" style={{ height: 'calc(100vh - 120px)' }}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between bg-surface shrink-0">
              <h2 className="font-semibold text-gray-900 text-[15px]">Review & Post</h2>
              {selectedThread.url ? (
                <a href={selectedThread.url} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-blue-600 flex items-center gap-1.5 hover:text-blue-700 transition-colors">
                  Open Thread <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <span className="text-[13px] font-medium text-gray-300 flex items-center gap-1.5">
                  Open Thread <ExternalLink className="w-3.5 h-3.5" />
                </span>
              )}
            </div>

            <div className="p-6 flex-1 bg-white overflow-y-auto">
              {/* Original Post Preview */}
              <div className="flex flex-col gap-2 mb-8">
                <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  <MessageCircle className="w-3.5 h-3.5" />
                  Original Post Preview
                </div>
                <div className="border-l-[3px] border-gray-200 pl-4 py-1">
                  {selectedThread.title && <h3 className="text-[14px] font-semibold text-gray-900 mb-1.5 leading-snug">{selectedThread.title}</h3>}
                  <p className="text-[13px] text-gray-600 leading-relaxed">{selectedThread.content}</p>
                </div>
              </div>

              {/* AI Draft Reply */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-[12px] font-bold text-blue-600 tracking-wide uppercase">AI Draft Reply</span>
                  </div>
                  <span className="text-[12px] text-gray-400 font-medium">{selectedThread.draft.length} chars</span>
                </div>

                <div className="bg-surface border border-gray-200/80 rounded-xl p-5 shadow-sm group relative">
                  {selectedThread.draft ? (
                    selectedThread.draft.split('\n\n').map((paragraph, i) => (
                      <p key={i} className="text-[14px] text-gray-800 leading-[1.6] mb-4 last:mb-0">
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <p className="text-[14px] text-gray-400 italic">No draft generated yet. The AI will draft a reply once the thread is scored.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-5 py-4 bg-surface border-t border-black/5 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleDismiss}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Dismiss thread"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="p-2 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-40"
                  title="Regenerate draft"
                >
                  <RefreshCcw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (selectedThread.draft) {
                      navigator.clipboard.writeText(selectedThread.draft)
                      toast.success('Copied to clipboard')
                    }
                  }}
                  className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
                <button
                  onClick={handleMarkAsPosted}
                  className="px-3 py-2 rounded-lg text-[13px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  Mark as Posted
                </button>
                <button
                  onClick={handleApproveAndSend}
                  className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-black text-white text-[13px] font-medium transition-colors shadow-sm flex items-center gap-1.5 ml-1"
                >
                  Approve & Send
                  <ArrowRight className="w-3.5 h-3.5 text-white/70" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
