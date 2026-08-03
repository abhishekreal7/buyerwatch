'use client'

import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Copy, Check, CheckCircle, X, RefreshCcw, ExternalLink, Search, AtSign, MessageCircle } from 'lucide-react'
import { RedditIcon, BlueskyIcon } from '@/components/Icons'
import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { getIntentDisplayLabel, type IntentLabel } from '@/lib/intent'
import { evaluateReplyQuality } from '@/lib/reply-quality'
import { useDashboardSession } from '@/components/DashboardContext'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import { IntentBadge } from '@/components/IntentBadge'
import { waitForReplyDelivery, type ReplySendResult } from '@/lib/reply-send-client'
import { useExtensionStatus } from '@/components/ExtensionInstall'
import { openRedditAssistedReply } from '@/lib/reddit-assist-client'

const PAGE_SIZE = 40

function PlatformIcon({ platform, size = 'sm' }: { platform: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5'
  const norm = platform.toLowerCase()
  if (norm === 'reddit') return <RedditIcon className={`${cls} text-[#FF4500]`} />
  if (norm === 'bluesky') return <BlueskyIcon className={`${cls} text-[#1185FE]`} />
  if (norm === 'x') return <AtSign className={`${cls} text-[#0F1419]`} />
  return <MessageCircle className={`${cls} text-gray-500`} />
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return `${Math.floor(diffInSeconds / 86400)} days ago`
}

function parseDrafts(data: any[]) {
  return data.map(t => {
    const keyword = Array.isArray(t.keywords) ? t.keywords[0] : t.keywords
    const score = Number(t.intent_score) || 0
    return {
      id: t.id,
      platform: t.platform,
      target: t.author || 'unknown',
      community: keyword?.target || t.platform,
      timeAgo: formatTimeAgo(t.created_at),
      title: t.title || '',
      content: t.text_content,
      score,
      label: getIntentDisplayLabel(t.intent_label as IntentLabel | undefined, score),
      draft: t.reply_analytics?.[0]?.draft_text || '',
      matchedKeyword: keyword?.term || 'Monitoring rule',
      url: t.url || null,
      qualityIssues: Array.isArray(t.quality_issues) ? t.quality_issues : [],
      automationReason: t.automation_reason || '',
      reasoning: t.score_reasoning || '',
    }
  })
}

export default function DraftsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [drafts, setDrafts] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [draftContent, setDraftContent] = useState('')
  // Tracks the original AI-generated draft text at the moment it was selected.
  // This is the source-of-truth for edit-distance: comparing this against draftContent
  // at approval time is what determines APPROVED vs EDITED_APPROVED.
  // We must NOT use selected.draft here — selected updates on every selection change,
  // so reading selected.draft inside handleApproveAndSend would be stale.
  const originalDraftRef = useRef<string>('')
  const [copied, setCopied] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [manualPostReadyId, setManualPostReadyId] = useState<string | null>(null)
  const [connections, setConnections] = useState<string[]>([])
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()
  const { isInstalled: extensionInstalled } = useExtensionStatus()

  useEffect(() => {
    async function fetchDrafts() {
      const [connectionsResult, profileResult, draftsResult, draftCountResult] = await Promise.all([
        supabase.from('platform_connections').select('platform').eq('user_id', userId),
        supabase.from('profiles').select('business_name').eq('id', userId).single(),
        supabase
          .from('monitored_threads')
          .select('*, reply_analytics(draft_text), keywords(term, target)')
          .eq('user_id', userId)
          .in('status', ['drafted', 'needs_manual_reply'])
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1),
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', ['drafted', 'needs_manual_reply']),
      ])
      const conns = connectionsResult.data
      if (conns) setConnections(conns.map(c => c.platform))
      const profile = profileResult.data
      setBusinessName(profile?.business_name || '')
      const data = draftsResult.data

      if (data && data.length > 0) {
        const parsed = parseDrafts(data)
        setDrafts(parsed)
        setSelected(parsed[0])
        setDraftContent(parsed[0].draft)
        originalDraftRef.current = parsed[0].draft
      }
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
      setTotalCount(draftCountResult.count ?? data?.length ?? 0)
      setLoading(false)
    }
    void fetchDrafts()
  }, [supabase, userId])

  async function loadMoreDrafts() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const from = drafts.length
    const { data, error } = await supabase
      .from('monitored_threads')
      .select('*, reply_analytics(draft_text), keywords(term, target)')
      .eq('user_id', userId)
      .in('status', ['drafted', 'needs_manual_reply'])
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      toast.error('Unable to load more drafts.')
    } else {
      setDrafts(current => [...current, ...parseDrafts(data ?? [])])
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
    }
    setLoadingMore(false)
  }

  const handleSelect = (d: any) => {
    setSelected(d)
    setDraftContent(d.draft)
    // Capture the original AI draft at selection time — this is the baseline
    // for edit-distance comparison in handleApproveAndSend.
    originalDraftRef.current = d.draft
    setCopied(false)
    setManualPostReadyId(null)
  }

  // Also sync ref on initial load (first draft auto-selected)
  useEffect(() => {
    if (drafts.length > 0 && originalDraftRef.current === '') {
      originalDraftRef.current = drafts[0].draft
    }
  }, [drafts])

  const handleCopy = () => {
    navigator.clipboard.writeText(draftContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApproveAndSend = async () => {
    if (!selected) return
    if (manualPostReadyId === selected.id) {
      setIsSending(true)
      try {
        const response = await fetch('/api/replies/mark-posted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId: selected.id, text: draftContent, platform: selected.platform }),
        })
        if (!response.ok) throw new Error('Could not confirm this reply as posted')
        clearSupabaseReadCache()
        const postedId = selected.id
        const remaining = drafts.filter(draft => draft.id !== postedId)
        setDrafts(remaining)
        setTotalCount(current => Math.max(0, current - 1))
        setSelected(remaining[0] ?? null)
        setDraftContent(remaining[0]?.draft ?? '')
        originalDraftRef.current = remaining[0]?.draft ?? ''
        setManualPostReadyId(null)
        toast.success('Marked as posted')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not confirm this reply as posted')
      } finally {
        setIsSending(false)
      }
      return
    }
    const quality = evaluateReplyQuality(draftContent, {
      businessName,
      platform: selected.platform,
    })
    if (quality.blocksAutomation) {
      toast.error(quality.issues[0]?.message || 'Resolve the publishing checks before posting.')
      return
    }
    if (selected.platform !== 'reddit' && !connections.includes(selected.platform)) {
      toast.error(`Please connect your ${selected.platform} account in Settings first.`)
      return
    }
    setIsSending(true)
    const threadIdToSend = selected.id
    const platformToSend = selected.platform
    // Use the ref — not selected.draft — to get the original at the time this
    // draft was selected. selected.draft would be stale if the user switched
    // between drafts before approving.
    const originalReplyText = originalDraftRef.current
    const replyTextToSend = draftContent

    try {
      const res = await fetch('/api/replies/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: threadIdToSend, platform: platformToSend, text: replyTextToSend, triggerType: 'manual' })
      })
      const payload = await res.json().catch(() => null) as (ReplySendResult & { error?: string; issues?: Array<{ message?: string }> }) | null
      if (!res.ok) {
        throw new Error(payload?.issues?.[0]?.message || payload?.error || 'Failed to queue reply')
      }
      clearSupabaseReadCache()

      if (payload?.mode === 'manual') {
        const mode = await openRedditAssistedReply({
          threadId: payload.threadId,
          text: payload.text,
          postUrl: payload.postUrl,
          extensionInstalled,
        })
        setManualPostReadyId(selected.id)
        if (mode === 'copy') {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }
        toast.success(mode === 'prefill'
          ? 'Opening Reddit with your reply prefilled. Review it, then submit on Reddit.'
          : 'Reply copied. Post it on Reddit, then confirm it here.')
        return
      }

      const actionType = originalReplyText === replyTextToSend ? 'APPROVED' : 'EDITED_APPROVED'
      const feedbackResponse = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: threadIdToSend,
          originalDraft: originalReplyText,
          finalDraft: replyTextToSend,
          actionType,
          platform: platformToSend,
          targetCommunity: selected.community,
          keywordCluster: selected.matchedKeyword,
        }),
      })
      if (!feedbackResponse.ok) {
        toast.warning('Reply is posting, but review history could not be updated.')
      }

      toast.info('Posting reply...')
      await waitForReplyDelivery(threadIdToSend)
      setDrafts(prev => prev.filter(d => d.id !== threadIdToSend))
      setTotalCount(current => Math.max(0, current - 1))
      const nextSelected = drafts.find(d => d.id !== threadIdToSend) || null
      setSelected(nextSelected)
      setDraftContent(nextSelected?.draft || '')
      originalDraftRef.current = nextSelected?.draft || ''
      toast.success('Reply posted successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reply')
    } finally {
      setIsSending(false)
    }
  }

  const handleDismiss = () => {
    if (!selected) return
    const threadIdToDismiss = selected.id

    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: threadIdToDismiss,
        originalDraft: originalDraftRef.current,
        finalDraft: draftContent,
        actionType: 'REJECTED',
        platform: selected.platform,
        targetCommunity: selected.target,
        keywordCluster: selected.matchedKeyword
      })
    }).catch(console.error)

    // Reset ref so it doesn't bleed into the next selected draft
    originalDraftRef.current = ''
    supabase.rpc('dismiss_thread', { p_thread_id: threadIdToDismiss }).then()
    clearSupabaseReadCache()
    setDrafts(prev => prev.filter(d => d.id !== threadIdToDismiss))
    setTotalCount(current => Math.max(0, current - 1))
    const nextSelected = drafts.find(d => d.id !== threadIdToDismiss) || null
    setSelected(nextSelected)
    if (nextSelected) setDraftContent(nextSelected.draft)
    toast.success('Draft dismissed')
  }

  const handleRegenerate = async () => {
    if (!selected || isRegenerating) return
    setIsRegenerating(true)
    try {
      const res = await fetch('/api/replies/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: selected.id })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 403) {
          toast.error('Draft limit reached for your plan.')
        } else {
          toast.error(err.error || 'Failed to regenerate draft')
        }
        return
      }
      const { draft: newDraft } = await res.json()
      clearSupabaseReadCache()
      // Update the textarea
      setDraftContent(newDraft)
      // Update the in-memory list so re-selecting this draft shows the new text
      setDrafts(prev => prev.map(d => d.id === selected.id ? { ...d, draft: newDraft } : d))
      setSelected((prev: any) => prev ? { ...prev, draft: newDraft } : prev)
      // The newly generated text is now the baseline for edit-distance
      originalDraftRef.current = newDraft
      toast.success('Draft regenerated')
    } catch {
      toast.error('Failed to regenerate draft')
    } finally {
      setIsRegenerating(false)
    }
  }

  const currentQuality = selected
    ? evaluateReplyQuality(draftContent, {
        businessName,
        platform: selected.platform,
      })
    : null

  const filteredDrafts = drafts.filter(d => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    return (
      d.title?.toLowerCase().includes(q) ||
      d.content?.toLowerCase().includes(q) ||
      d.target?.toLowerCase().includes(q) ||
      d.draft?.toLowerCase().includes(q)
    )
  })

  return (
    <AppPage>
      <div className="flex w-full flex-col" style={{ height: 'calc(100vh - 56px)' }}>

        {/* ── Page Header ─────────────────────────────────────── */}
        <PageHeader title="Drafts Ready" />

        {/* ── Body: always side-by-side from md+ ─────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* LEFT: Compact Lead List */}
          <div className="flex flex-col border-r border-[#E7E7E3] overflow-hidden" style={{ width: '380px', minWidth: '380px', flexShrink: 0 }}>

            {/* List header bar */}
            <div className="shrink-0 px-4 py-3 border-b border-[#EDEDEA] flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-[#6B6B66]">
                <span className="tabular-nums font-bold text-[#1C1C1A]">{searchQuery.trim() ? filteredDrafts.length : totalCount}</span>
                {' '}drafts awaiting review
              </p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8C8C85] pointer-events-none" strokeWidth={2} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search"
                  className="h-8 w-36 rounded-[9px] border border-[#DEDEDA] bg-white pl-8 pr-3 text-[12px] text-[#1C1C1A] placeholder-[#8C8C85] focus:border-[#0A84FF] focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/15"
                />
              </div>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[84px] animate-pulse bg-[#F5F5F3] border-b border-[#F0F0ED] mx-3 my-2 rounded-lg" />
                ))
              ) : filteredDrafts.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-[13px] text-[#8C8C85]">
                  No drafts found
                </div>
              ) : (
                filteredDrafts.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleSelect(d)}
                    className={`w-full text-left px-4 py-3.5 border-b border-[#F0F0ED] transition-colors duration-100 group ${
                      selected?.id === d.id
                        ? 'bg-[#FFF8F5] border-l-2 border-l-[#FF5101]'
                        : 'bg-white border-l-2 border-l-transparent hover:bg-[#FAFAF8]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className={`text-[13.5px] font-semibold leading-snug line-clamp-1 transition-colors ${
                        selected?.id === d.id ? 'text-[#1C1C1A]' : 'text-[#1C1C1A] group-hover:text-[#FF5101]'
                      }`}>
                        {d.title || d.matchedKeyword || 'Draft reply'}
                      </h4>
                      <IntentBadge score={d.score} label={d.label} className="shrink-0 text-[10.5px]" />
                    </div>

                    <p className="text-[12px] text-[#6B6B66] line-clamp-2 leading-relaxed mb-2">
                      {d.content}
                    </p>

                    <div className="flex items-center gap-2 text-[11px] text-[#8C8C85]">
                      <PlatformIcon platform={d.platform} />
                      <span className="font-medium text-[#4A4A45] truncate max-w-[90px]">
                        {d.platform === 'reddit' ? `r/${d.community}` : d.community}
                      </span>
                      <span className="opacity-40">·</span>
                      <span>{d.timeAgo}</span>
                      {d.draft && (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="text-emerald-600 font-semibold">Draft ready</span>
                        </>
                      )}
                    </div>
                  </button>
                ))
              )}

              {/* Load more */}
              {!loading && hasMore && (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={loadMoreDrafts}
                    disabled={loadingMore}
                    className="rounded-full border border-black/[0.08] bg-white px-5 py-2 text-[12px] font-semibold text-[#1C1C1A] shadow-xs hover:bg-black/[0.025] disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Draft Review Panel */}
          {selected ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">

              {/* Panel Header */}
              <div className="shrink-0 flex items-center justify-between gap-3 border-b border-[#EDEDEA] px-6 py-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <PlatformIcon platform={selected.platform} size="md" />
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold text-[#1C1C1A]">Conversation</h3>
                    <span className="block truncate text-[11px] font-medium text-[#8C8C85]">
                      {selected.platform === 'reddit' ? `r/${selected.community}` : selected.community}
                    </span>
                  </div>
                </div>
                {selected.url ? (
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-[#0A84FF] hover:bg-[#F0F7FF] transition-colors shrink-0"
                  >
                    Open post <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#8C8C85] shrink-0">
                    Open post <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                )}
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* Original post */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8C8C85] mb-2">Original post</p>
                  <div className="rounded-[16px] border border-[#E8E8E5] bg-[#F7F7F5] px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-2 text-[11px] font-medium text-[#8C8C85]">
                      <PlatformIcon platform={selected.platform} />
                      <span>{selected.platform === 'reddit' ? `r/${selected.community}` : selected.community}</span>
                      <span className="opacity-40">·</span>
                      <span>{selected.timeAgo}</span>
                    </div>
                    {selected.title && (
                      <h4 className="text-[14px] font-semibold text-[#1C1C1A] leading-snug mb-1.5">
                        {selected.title}
                      </h4>
                    )}
                    <p className="text-[13px] leading-relaxed text-[#4A4A45]" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{selected.content}</p>
                  </div>
                </div>

                {/* Draft reply — full inline editor */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8C8C85]">Your reply draft</p>
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={isRegenerating || isSending}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-[#4A4A45] hover:bg-[#F0F0ED] transition-colors disabled:opacity-40"
                    >
                      <RefreshCcw className={`h-3 w-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                      {isRegenerating ? 'Regenerating…' : 'Regenerate'}
                    </button>
                  </div>

                  {draftContent ? (
                    <textarea
                      value={draftContent}
                      onChange={e => setDraftContent(e.target.value)}
                      className="w-full rounded-[16px] border border-[#DEDEDA] bg-white px-4 py-3.5 text-[13.5px] leading-relaxed text-[#1C1C1A] resize-none focus:border-[#0A84FF] focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/15 transition-colors"
                      rows={6}
                      spellCheck
                      placeholder="Your draft will appear here…"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="w-full rounded-[16px] border-2 border-dashed border-[#DEDEDA] px-4 py-8 text-[13px] font-semibold text-[#8C8C85] hover:border-[#0A84FF] hover:text-[#0A84FF] transition-colors disabled:opacity-50"
                    >
                      {isRegenerating ? 'Generating reply…' : '+ Generate reply'}
                    </button>
                  )}

                  {draftContent && (
                    <p className="mt-1.5 text-right text-[10.5px] tabular-nums text-[#8C8C85]">{draftContent.length} characters</p>
                  )}
                </div>

                {/* Quality Issues */}
                {draftContent && currentQuality?.blocksAutomation && (
                  <div className="space-y-2">
                    {currentQuality.issues.map(issue => (
                      <div key={issue.code} className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] font-medium text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sticky Footer Actions */}
              <div className="shrink-0 border-t border-[#EDEDEA] bg-white px-6 py-4">
                {(() => {
                  const isReddit = selected?.platform === 'reddit';
                  const isMarkAsPosted = manualPostReadyId === selected?.id;
                  const isDisabled = !draftContent || isSending || currentQuality?.blocksAutomation;
                  const btnClass = isDisabled
                    ? 'flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-[14px] border border-[#E0E0DC] bg-[#F2F2EF] text-[14px] font-semibold text-[#AEAEAD] transition-colors'
                    : isMarkAsPosted
                      ? 'flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-emerald-600 text-[14px] font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] transition-all'
                      : isReddit
                        ? 'flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[#FF4500] text-[14px] font-semibold text-white shadow-sm hover:bg-[#E03D00] active:scale-[0.99] transition-all'
                        : 'flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[#0085FF] text-[14px] font-semibold text-white shadow-sm hover:bg-[#006FD6] active:scale-[0.99] transition-all';
                  return (
                    <button
                      type="button"
                      onClick={handleApproveAndSend}
                      disabled={isDisabled}
                      className={btnClass}
                    >
                      {isSending ? (
                        <><RefreshCcw className="h-4 w-4 animate-spin" /> {isReddit ? 'Preparing...' : 'Posting...'}</>
                      ) : (
                        <><CheckCircle className="h-4 w-4" strokeWidth={2.5} /> {
                          isMarkAsPosted
                            ? 'Mark as Posted'
                            : isReddit
                              ? (extensionInstalled ? 'Prefill in Reddit' : 'Copy & Open Reddit')
                              : 'Post through Bluesky'
                        }</>
                      )}
                    </button>
                  );
                })()}

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleDismiss}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DEDEDA] bg-white text-[#6B6B66] hover:bg-[#F5F5F3] hover:text-[#1C1C1A] transition-colors"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>

                  <button
                    onClick={handleCopy}
                    disabled={!draftContent}
                    className="flex h-9 items-center gap-2 rounded-[10px] border border-[#DEDEDA] bg-white px-3.5 text-[12.5px] font-semibold text-[#4A4A45] hover:bg-[#F7F7F4] transition-colors disabled:opacity-40"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F2F2EF]">
                <CheckCircle className="h-7 w-7 text-[#8C8C85]" strokeWidth={1.75} />
              </div>
              <p className="text-[14px] font-semibold text-[#4A4A45] mb-1">
                {loading ? 'Loading drafts…' : 'No drafts yet'}
              </p>
              <p className="text-[13px] text-[#8C8C85] max-w-[240px] leading-relaxed">
                {loading ? '' : 'Qualified leads with generated replies will appear here for review.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppPage>
  )
}
