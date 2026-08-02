'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Copy, Check, CheckCircle, X, RefreshCcw, ExternalLink, Search } from 'lucide-react'
import { springs, staggers } from '@/lib/motion'
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

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="px-2.5 py-1 rounded-md bg-black/[0.04] text-text-secondary text-[12px] font-[500] capitalize flex items-center gap-1.5 w-fit shrink-0">
      {platform.toLowerCase() === 'reddit' ? <RedditIcon className="w-3.5 h-3.5 text-[#FF4500]" /> : <BlueskyIcon className="w-3.5 h-3.5 text-[#1185FE]" />}
      {platform}
    </span>
  )
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
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
  const [isEditingReply, setIsEditingReply] = useState(false)
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
    setIsEditingReply(false)
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
      setIsEditingReply(false)
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
    setIsEditingReply(false)
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
      <div className="flex w-full min-w-0 flex-col 2xl:h-[calc(100vh-144px)] 2xl:overflow-hidden">
        <PageHeader title="Drafts Ready" />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-visible 2xl:flex-row 2xl:gap-8 2xl:overflow-hidden">
        {/* Draft list */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="pb-4 shrink-0 px-1 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            <p className="text-[14px] font-medium text-text-secondary"><span className="tabular-nums font-bold text-text-primary">{searchQuery.trim() ? filteredDrafts.length : totalCount}</span> drafts awaiting review</p>
            
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-900 pointer-events-none" strokeWidth={2} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search thread"
                className="w-full rounded-2xl border border-gray-200/90 bg-white py-2 pl-9 pr-4 text-xs font-normal text-gray-800 shadow-2xs placeholder-gray-500 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/20 focus:border-[#0A84FF] transition-all"
              />
            </div>
          </div>
          <motion.div variants={staggers.container} initial="initial" animate="animate" className="flex-1 space-y-4 px-1 pb-4 2xl:overflow-y-auto">
            {loading && Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-[18px] border border-black/[0.05] bg-white" />
            ))}
            {filteredDrafts.map(d => (
              <motion.div
                key={d.id}
                variants={staggers.item}
                onClick={() => handleSelect(d)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleSelect(d)
                  }
                }}
                role="button"
                tabIndex={0}
                aria-pressed={selected?.id === d.id}
                whileHover={selected?.id === d.id ? {} : { y: -2, boxShadow: 'var(--shadow-elevation-2)' }}
                transition={springs.smooth}
                className={`surface-ceramic p-6 cursor-pointer transition-all duration-300 ${
                  selected?.id === d.id 
                    ? 'ring-2 ring-accent shadow-elevation-2 z-10 relative' 
                    : 'shadow-elevation-1 hover:shadow-elevation-2 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                  <PlatformBadge platform={d.platform} />
                  <span className="text-[13px] font-semibold text-text-primary">{d.platform === 'reddit' ? `r/${d.target}` : `"${d.target}"`}</span>
                  <span className="opacity-50 text-[13px]">·</span>
                  <span className="text-[13px] font-medium text-text-secondary ml-auto">{d.timeAgo}</span>
                </div>
                {d.title && <p className="text-[16px] font-semibold text-text-primary mb-2 leading-snug tracking-tight line-clamp-1">{d.title}</p>}
                <p className="text-[14px] text-text-secondary line-clamp-2 mb-4 leading-relaxed">{d.content}</p>
                <div className="flex items-center pt-4 border-t border-black/[0.04]">
                  <IntentBadge score={d.score} label={d.label} />
                </div>
              </motion.div>
            ))}
            {!loading && hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={loadMoreDrafts}
                  disabled={loadingMore}
                  className="rounded-full border border-black/[0.08] bg-white px-5 py-2.5 text-[13px] font-semibold text-text-primary shadow-sm transition-colors hover:bg-black/[0.025] disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more drafts'}
                </button>
              </div>
            )}
          </motion.div>
        </div>

        {/* Conversation review panel */}
        {selected && (
          <div className="order-first flex min-h-0 min-w-0 w-full shrink-0 flex-col overflow-hidden rounded-[24px] border border-black/[0.06] bg-surface shadow-elevation-3 2xl:order-last 2xl:w-[48%] 2xl:max-w-[600px]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                {selected.platform.toLowerCase() === 'reddit' ? (
                  <RedditIcon className="h-5 w-5 shrink-0 text-[#FF4500]" />
                ) : (
                  <BlueskyIcon className="h-5 w-5 shrink-0 text-[#1185FE]" />
                )}
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold text-text-primary">Conversation</h3>
                  <span className="block truncate text-[11px] font-medium text-text-tertiary">
                    {selected.platform === 'reddit' ? `r/${selected.community}` : selected.community}
                  </span>
                </div>
              </div>
              {selected.url ? (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/5"
                >
                  Open post <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
                </a>
              ) : (
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-tertiary">
                  Open post <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              )}
            </div>

            <div className="flex-1 space-y-5 bg-surface p-4 sm:p-6 2xl:overflow-y-auto">
              <div className="flex justify-start">
                <div className="w-fit max-w-[88%] rounded-[18px] rounded-bl-md border border-black/[0.04] bg-[#F1F1EF] px-4 py-3.5">
                  <div className="mb-2 flex items-center gap-2 text-[10.5px] font-medium text-text-tertiary">
                    {selected.platform.toLowerCase() === 'reddit' ? (
                      <RedditIcon className="h-3.5 w-3.5 text-[#FF4500]" />
                    ) : (
                      <BlueskyIcon className="h-3.5 w-3.5 text-[#1185FE]" />
                    )}
                    <span>{selected.platform === 'reddit' ? `r/${selected.community}` : selected.community}</span>
                  </div>
                  {selected.title && (
                    <h4 className="mb-1 line-clamp-2 text-[13px] font-semibold leading-snug text-text-primary">
                      {selected.title}
                    </h4>
                  )}
                  <p className="line-clamp-3 text-[12.5px] leading-relaxed text-text-secondary">{selected.content}</p>
                  <p className="mt-1.5 text-right text-[10px] font-medium text-text-tertiary">{selected.timeAgo}</p>
                </div>
              </div>

              {isEditingReply ? (
                <div className="ml-auto w-full max-w-[92%]">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[11px] font-semibold text-text-secondary">Your reply</span>
                    <button
                      type="button"
                      onClick={() => setIsEditingReply(false)}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/5"
                    >
                      Done
                    </button>
                  </div>
                  <div className="rounded-[20px] rounded-br-md bg-accent p-1 shadow-[0_4px_18px_rgba(10,132,255,0.16)]">
                    <textarea
                      value={draftContent}
                      onChange={event => setDraftContent(event.target.value)}
                      className="min-h-[240px] w-full resize-none rounded-[16px] bg-white p-4 text-[13px] leading-relaxed text-text-primary outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-white/60"
                      placeholder="Write your reply..."
                      autoFocus
                      spellCheck
                    />
                  </div>
                  <p className="mt-1.5 px-1 text-right text-[10.5px] tabular-nums text-text-tertiary">{draftContent.length} characters</p>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => draftContent ? setIsEditingReply(true) : void handleRegenerate()}
                    disabled={isRegenerating || isSending}
                    className="group w-fit max-w-[82%] rounded-[20px] rounded-br-md bg-accent px-4 py-3 text-left text-white shadow-[0_4px_18px_rgba(10,132,255,0.16)] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:hover:translate-y-0 disabled:opacity-70"
                  >
                    {draftContent ? (
                      <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-relaxed text-white">{draftContent}</p>
                    ) : (
                      <p className="text-[13px] font-semibold text-white">{isRegenerating ? 'Preparing reply...' : 'Generate reply'}</p>
                    )}
                    <div className="mt-2 flex items-center justify-end gap-2 text-[10px] font-medium text-white/65">
                      <span>{draftContent ? 'Draft' : 'Not generated'}</span>
                      <span aria-hidden="true">&middot;</span>
                      <span className="group-hover:text-white/90">{draftContent ? 'Open full reply' : 'Create preview'}</span>
                    </div>
                  </button>
                </div>
              )}

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

            <div className="shrink-0 border-t border-black/[0.06] bg-surface p-4 sm:p-5">
              <button
                type="button"
                onClick={handleApproveAndSend}
                disabled={!draftContent || isSending || currentQuality?.blocksAutomation}
                className="btn-primary flex min-h-11 w-full items-center justify-center gap-2 !rounded-[14px] disabled:opacity-40"
              >
                {isSending ? (
                  <><RefreshCcw className="h-4 w-4 animate-spin" /> {selected?.platform === 'reddit' ? 'Preparing...' : 'Posting...'}</>
                ) : (
                  <><CheckCircle className="h-4 w-4" strokeWidth={2.5} /> {
                    manualPostReadyId === selected?.id
                      ? 'Mark as Posted'
                      : selected?.platform === 'reddit'
                        ? (extensionInstalled ? 'Prefill in Reddit' : 'Copy & Open Reddit')
                        : 'Post through Bluesky'
                  }</>
                )}
              </button>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <button onClick={handleDismiss} className="btn-icon min-h-10 min-w-10 bg-background border border-black/[0.04]" title="Dismiss" aria-label="Dismiss draft">
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating || isSending}
                    className="btn-icon min-h-10 min-w-10 bg-background border border-black/[0.04] disabled:opacity-40"
                    title="Regenerate draft"
                    aria-label="Regenerate draft"
                  >
                    <RefreshCcw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} strokeWidth={2} />
                  </button>
                </div>
                <button
                  onClick={handleCopy}
                  disabled={!draftContent}
                  className="btn-secondary flex min-h-10 items-center gap-2 !rounded-[12px] px-4 disabled:opacity-40"
                >
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </AppPage>
  )
}
