'use client'

import { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Copy,
  Check,
  CheckCircle,
  CheckCircle2,
  X,
  RefreshCcw,
  ExternalLink,
  Search,
  MessageCircle,
  Sparkles,
  RotateCcw,
} from 'lucide-react'
import { RedditIcon, BlueskyIcon, XIcon } from '@/components/Icons'
import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { ACTIONABLE_INTENT_THRESHOLD, getIntentDisplayLabel, type IntentLabel } from '@/lib/intent'
import { evaluateReplyQuality } from '@/lib/reply-quality'
import { useDashboardSession } from '@/components/DashboardContext'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import { waitForReplyDelivery, type ReplySendResult } from '@/lib/reply-send-client'
import { copyAndOpenRedditReply } from '@/lib/reddit-handoff-client'
import { BILLING_ADDONS } from '@/lib/billing-addons'
import { RedditCommunityPolicyNotice } from '@/components/RedditCommunityPolicyNotice'
import { DataLoadError } from '@/components/DataLoadError'
import { OpportunityStageNav } from '@/components/OpportunityStageNav'
import { trackEvent } from '@/lib/analytics'

const PAGE_SIZE = 40

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  bluesky: 300,
  x: 280,
  reddit: 10000,
}

const MANUAL_DRAFT_REASON_LABELS: Record<string, string> = {
  ai_provider_unavailable: 'AI drafting is unavailable right now. You can still write and send this reply manually.',
  ai_spend_limit_reached: 'The AI drafting budget was reached. You can still write and send this reply manually.',
  draft_plan_limit_reached: 'The AI draft allowance was reached. You can still write and send this reply manually.',
  draft_provider_failed: 'AI drafting failed for this conversation. Your opportunity is safe, and you can write the reply manually or retry later.',
  intent_provider_failed: 'AI intent scoring was unavailable. Review the deterministic match before writing a reply.',
  intent_spend_limit_reached: 'The AI scoring budget was reached. Review the deterministic match before writing a reply.',
  intent_plan_limit_reached: 'The daily AI scoring allowance was reached. Review the deterministic match before writing a reply.',
  preflight_ai_bypassed: 'AI scoring was unavailable. Review the match signals before writing a reply.',
}

function PlatformIcon({ platform, size = 'sm' }: { platform: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const norm = platform.toLowerCase()
  if (norm === 'reddit') return <RedditIcon className={`${cls} text-[#FF4500]`} />
  if (norm === 'bluesky') return <BlueskyIcon className={`${cls} text-[#0284C7]`} />
  if (norm === 'x') return <XIcon className={`${cls} text-[#0F1419]`} />
  return <MessageCircle className={`${cls} text-gray-500`} />
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  const days = Math.floor(diffInSeconds / 86400)
  return `${days}d ago`
}

function postBodyWithoutRepeatedTitle(title: string, content: string) {
  const normalizedTitle = title.trim()
  const lines = content.trim().split(/\r?\n/)
  if (normalizedTitle && lines[0]?.trim().toLocaleLowerCase() === normalizedTitle.toLocaleLowerCase()) {
    return lines.slice(1).join('\n').trim()
  }
  return content.trim()
}

function formatCommunityLabel(platform: string, community: string | null | undefined) {
  const value = (community || platform || 'Source').trim()
  if (platform.toLowerCase() === 'reddit') {
    return `r/${value.replace(/^r\//i, '')}`
  }
  return value
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
      timeAgo: formatTimeAgo(t.source_created_at || t.created_at),
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

function ActiveOpportunityCount({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-2 rounded-full bg-gray-900 px-3.5 py-1 text-[12px] font-semibold text-white shadow-sm ring-1 ring-black/5">
      <span className="relative flex h-2 w-2 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#0A84FF] opacity-50" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#0A84FF]" aria-hidden="true" />
      </span>
      {count} {count === 1 ? 'opportunity' : 'opportunities'}
    </div>
  )
}

type ReplyQueueWorkspaceProps = {
  initialThreadId?: string
}

export function ReplyQueueWorkspace({ initialThreadId }: ReplyQueueWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [drafts, setDrafts] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [draftContent, setDraftContent] = useState('')
  const [isPostExpanded, setIsPostExpanded] = useState(false)
  const originalDraftRef = useRef<string>('')
  const [copied, setCopied] = useState(false)
  const [copiedPost, setCopiedPost] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [manualPostReadyId, setManualPostReadyId] = useState<string | null>(null)
  const [draftLimitReached, setDraftLimitReached] = useState(false)
  const [openingDraftAddon, setOpeningDraftAddon] = useState(false)
  const [connections, setConnections] = useState<string[]>([])
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [reviewCount, setReviewCount] = useState(0)
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()

  useEffect(() => {
    async function fetchDrafts() {
      setLoading(true)
      setLoadFailed(false)

      try {
        const requestedDraft = initialThreadId
          ? supabase
              .from('monitored_threads')
              .select('*, reply_analytics(draft_text), keywords(term, target)')
              .eq('user_id', userId)
              .eq('id', initialThreadId)
              .in('status', ['drafted', 'needs_manual_reply'])
              .maybeSingle()
          : Promise.resolve({ data: null, error: null })

        const [connectionsResult, profileResult, draftsResult, draftCountResult, reviewCountResult, requestedDraftResult] = await Promise.all([
          supabase.from('platform_connections').select('platform').eq('user_id', userId),
          supabase.from('profiles').select('business_name').eq('id', userId).single(),
          supabase
            .from('monitored_threads')
            .select('*, reply_analytics(draft_text), keywords(term, target)')
            .eq('user_id', userId)
            .in('status', ['drafted', 'needs_manual_reply'])
            .order('source_created_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .range(0, PAGE_SIZE - 1),
          supabase
            .from('monitored_threads')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('status', ['drafted', 'needs_manual_reply']),
          supabase
            .from('monitored_threads')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'pending')
            .not('intent_score', 'is', null)
            .gte('intent_score', ACTIONABLE_INTENT_THRESHOLD),
          requestedDraft,
        ])
        const queryError = [connectionsResult, profileResult, draftsResult, draftCountResult, reviewCountResult, requestedDraftResult]
          .find(result => result.error)?.error
        if (queryError) throw queryError

        const conns = connectionsResult.data
        setConnections((conns ?? []).map(connection => connection.platform))
        setBusinessName(profileResult.data?.business_name || '')
        const data = draftsResult.data ?? []
        const requestedRow = requestedDraftResult.data
        const rows = requestedRow && !data.some(draft => draft.id === requestedRow.id)
          ? [requestedRow, ...data]
          : data
        const parsed = parseDrafts(rows)
        const initiallySelected = parsed.find(draft => draft.id === initialThreadId) ?? parsed[0] ?? null
        setDrafts(parsed)
        setSelected(initiallySelected)
        setDraftContent(initiallySelected?.draft ?? '')
        originalDraftRef.current = initiallySelected?.draft ?? ''
        setHasMore(data.length === PAGE_SIZE)
        setTotalCount(draftCountResult.count ?? data.length)
        setReviewCount(reviewCountResult.count ?? 0)
      } catch (error) {
        console.error('[drafts] Unable to load drafts', error)
        toast.error('Unable to load drafts.')
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    }
    void fetchDrafts()
  }, [initialThreadId, loadAttempt, supabase, userId])

  async function loadMoreDrafts() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const from = drafts.length
      const { data, error } = await supabase
        .from('monitored_threads')
        .select('*, reply_analytics(draft_text), keywords(term, target)')
        .eq('user_id', userId)
        .in('status', ['drafted', 'needs_manual_reply'])
        .order('source_created_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error

      setDrafts(current => [...current, ...parseDrafts(data ?? [])])
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
    } catch (error) {
      console.error('[drafts] Unable to load more drafts', error)
      toast.error('Unable to load more drafts.')
    } finally {
      setLoadingMore(false)
    }
  }

  const handleSelect = (d: any) => {
    setSelected(d)
    setDraftContent(d.draft)
    setIsPostExpanded(false)
    originalDraftRef.current = d.draft
    setCopied(false)
    setManualPostReadyId(null)
  }

  useEffect(() => {
    if (drafts.length > 0 && originalDraftRef.current === '') {
      originalDraftRef.current = drafts[0].draft
    }
  }, [drafts])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draftContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('[drafts] Unable to copy reply', error)
      toast.error('Could not copy the reply.')
    }
  }

  const handleCopyPost = async () => {
    if (!selected?.content) return
    try {
      await navigator.clipboard.writeText(selected.content)
      setCopiedPost(true)
      setTimeout(() => setCopiedPost(false), 2000)
      toast.success('Post text copied')
    } catch {
      toast.error('Could not copy post text')
    }
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
    const originalReplyText = originalDraftRef.current
    const replyTextToSend = draftContent

    try {
      const res = await fetch('/api/replies/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: threadIdToSend, platform: platformToSend, text: replyTextToSend, triggerType: 'manual' })
      })
      const payload = await res.json().catch(() => null) as (ReplySendResult & { error?: string; message?: string; issues?: Array<{ message?: string }> }) | null
      if (!res.ok) {
        throw new Error(payload?.issues?.[0]?.message || payload?.message || payload?.error || 'Failed to queue reply')
      }
      clearSupabaseReadCache()

      if (payload?.mode === 'manual') {
        await copyAndOpenRedditReply({
          text: payload.text,
          postUrl: payload.postUrl,
        })
        setManualPostReadyId(selected.id)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        toast.success('Reply copied. Post it on Reddit, then confirm it here.')
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
      trackEvent('reply_posted', {
        thread_id: threadIdToSend,
        platform: platformToSend,
        target: selected.target,
        is_edited: originalReplyText !== replyTextToSend,
      })
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

  const handleDismiss = async () => {
    if (!selected) return
    const threadIdToDismiss = selected.id

    try {
      const { error } = await supabase.rpc('dismiss_thread', { p_thread_id: threadIdToDismiss })
      if (error) throw error
      trackEvent('reply_dismissed', {
        thread_id: threadIdToDismiss,
        platform: selected.platform,
        target: selected.target,
      })
    } catch (error) {
      console.error('[drafts] Unable to dismiss draft', error)
      toast.error('Could not dismiss this draft. Nothing was removed.')
      return
    }

    void fetch('/api/feedback', {
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
      })
      .then(response => {
        if (!response.ok) console.error('[drafts] Dismissed draft but failed to record rejection feedback')
      })
      .catch(error => console.error('[drafts] Dismissed draft but failed to record rejection feedback', error))

    originalDraftRef.current = ''
    clearSupabaseReadCache()
    setDrafts(prev => prev.filter(d => d.id !== threadIdToDismiss))
    setTotalCount(current => Math.max(0, current - 1))
    const nextSelected = drafts.find(d => d.id !== threadIdToDismiss) || null
    setSelected(nextSelected)
    setDraftContent(nextSelected?.draft ?? '')
    originalDraftRef.current = nextSelected?.draft ?? ''
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
        if (res.status === 403 && err.error === 'plan_limit_reached' && err.limit === 'ai_drafts') {
          setDraftLimitReached(true)
          toast.error('Draft limit reached. Add 20 more drafts for $5.')
        } else {
          toast.error(err.message || err.error || 'Failed to regenerate draft')
        }
        return
      }
      const { draft: newDraft } = await res.json()
      clearSupabaseReadCache()
      trackEvent('reply_regenerated', {
        thread_id: selected.id,
        platform: selected.platform,
        target: selected.target,
      })
      setDraftContent(newDraft)
      setDrafts(prev => prev.map(d => d.id === selected.id ? { ...d, draft: newDraft } : d))
      setSelected((prev: any) => prev ? { ...prev, draft: newDraft } : prev)
      originalDraftRef.current = newDraft
      toast.success('Draft regenerated')
    } catch {
      toast.error('Failed to regenerate draft')
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleBuyDraftAddon = async () => {
    if (openingDraftAddon) return
    setOpeningDraftAddon(true)
    trackEvent('checkout_initiated', { addon: 'drafts', source: 'reply_workspace' })
    try {
      const idempotencyKey = crypto.randomUUID()
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ addon: 'drafts' }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'checkout_failed')
      }
      window.location.href = payload.url
    } catch (error) {
      toast.error(error instanceof Error && error.message === 'addon_billing_not_configured'
        ? 'Draft add-on checkout is not configured yet'
        : 'Could not open draft add-on checkout')
      setOpeningDraftAddon(false)
    }
  }

  const currentQuality = selected
    ? evaluateReplyQuality(draftContent, {
        businessName,
        platform: selected.platform,
      })
    : null

  const postBody = selected
    ? postBodyWithoutRepeatedTitle(selected.title || '', selected.content || '')
    : ''

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

  if (loadFailed) {
    return (
      <AppPage>
        <div className="flex w-full flex-col">
          <PageHeader
            title="Opportunities"
            action={<ActiveOpportunityCount count={reviewCount + totalCount} />}
          />
          <DataLoadError
            title="Couldn’t load the reply queue"
            description="Your saved replies are still safe. Check your connection and try loading them again."
            onRetry={() => setLoadAttempt(attempt => attempt + 1)}
            className="flex-1"
          />
        </div>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <div className="flex w-full flex-col">
        <PageHeader
          title="Opportunities"
          action={<ActiveOpportunityCount count={reviewCount + totalCount} />}
        />

        <OpportunityStageNav activeStage="replies" reviewCount={reviewCount} replyCount={totalCount} />

        {draftLimitReached && (
          <div className="mb-4 flex shrink-0 flex-col items-start gap-3 rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-orange-50/50 p-4 shadow-xs sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-inner">
              <RefreshCcw className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-[#1C1C1A]">Draft allowance used up</p>
              <p className="mt-0.5 text-xs text-[#6B6B66]">
                Keep Starter and add a small pack for this month to continue instant AI drafting.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBuyDraftAddon}
              disabled={openingDraftAddon}
              className="inline-flex min-h-10 items-center rounded-xl bg-gray-900 px-4 text-xs font-semibold text-white transition-all hover:bg-black disabled:opacity-60 shadow-sm"
            >
              {openingDraftAddon ? 'Opening...' : BILLING_ADDONS.drafts.ctaLabel}
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row h-[calc(100vh-280px)] min-h-[460px] rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden">

          {/* ── LEFT PANEL: Clean Inbox List ── */}
          <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 bg-[#FAFAFA] lg:w-[340px] lg:min-w-[340px] lg:max-w-[340px] shrink-0 overflow-hidden">
            <div className="shrink-0 px-3.5 py-3 border-b border-gray-200 bg-[#FAFAFA] flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-gray-900">
                Replies <span className="text-gray-400 font-normal text-xs">({searchQuery.trim() ? filteredDrafts.length : totalCount})</span>
              </span>
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search drafts"
                  placeholder="Filter..."
                  className="h-7 w-32 rounded-lg border border-gray-200 bg-white pl-7 pr-6 text-[12px] text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/5 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    title="Clear filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1" style={{ scrollbarWidth: 'thin' }}>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 space-y-2 animate-pulse rounded-xl bg-gray-100/50">
                    <div className="h-3.5 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                  </div>
                ))
              ) : filteredDrafts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                  <p className="text-[13px] font-medium text-gray-500">No replies in queue</p>
                </div>
              ) : (
                filteredDrafts.map(d => {
                  const isSelected = selected?.id === d.id

                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleSelect(d)}
                      className={`group w-full text-left p-3 rounded-xl transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] border border-gray-200/90 ring-1 ring-black/[0.04] text-gray-900'
                          : 'hover:bg-white/80 border border-transparent hover:border-gray-200/60 text-gray-700'
                      }`}
                    >
                      {/* Top meta row */}
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <div className="flex items-center gap-1.5 font-medium text-gray-600">
                          <PlatformIcon platform={d.platform} size="sm" />
                          <span className="truncate max-w-[130px] font-semibold text-gray-700">{d.platform === 'reddit' ? `r/${d.community}` : d.community}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400 font-normal">{d.timeAgo}</span>
                        </div>

                        {d.score > 0 && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${
                            d.score >= 80
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                              : d.score >= 65
                              ? 'bg-blue-50 text-blue-700 border-blue-200/60'
                              : 'bg-gray-100 text-gray-600 border-gray-200/60'
                          }`}>
                            {d.score}%
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <p className={`text-[12.5px] leading-snug line-clamp-2 ${
                        isSelected ? 'font-semibold text-gray-900' : 'font-medium text-gray-700 group-hover:text-gray-900'
                      }`}>
                        {d.title || d.matchedKeyword || 'Draft reply'}
                      </p>
                    </button>
                  )
                })
              )}

              {!loading && hasMore && (
                <div className="flex justify-center p-3">
                  <button
                    type="button"
                    onClick={loadMoreDrafts}
                    disabled={loadingMore}
                    className="rounded border border-gray-200 bg-white px-3 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL: Clean Detail Workspace ── */}
          {selected ? (
            <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden">
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-2.5 bg-white">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <PlatformIcon platform={selected.platform} size="md" />
                  <span className="text-[13.5px] font-semibold text-gray-900">
                    {selected.platform === 'reddit' ? `r/${selected.community}` : selected.community}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[12px] text-gray-500">
                    by <strong className="font-medium text-gray-700">{selected.target}</strong>
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[12px] text-gray-400">{selected.timeAgo}</span>
                  {selected.platform === 'reddit' && (
                    <RedditCommunityPolicyNotice subreddit={selected.community} compact />
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {selected.url && (
                    <a
                      href={selected.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-2xs"
                    >
                      Open post <ExternalLink className="h-3 w-3 text-gray-400" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="grid h-7 w-7 place-items-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
                    title="Dismiss from queue"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3 sm:space-y-3.5" style={{ scrollbarWidth: 'thin' }}>
                {/* Original Post */}
                <div className="rounded-xl border border-gray-200/90 bg-white shadow-2xs p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-gray-400">
                      <span className="uppercase">Original post</span>
                      <span className="text-gray-300" aria-hidden="true">·</span>
                      <span className="normal-case tracking-normal text-gray-500">{formatCommunityLabel(selected.platform, selected.community)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPost}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                    >
                      {copiedPost ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedPost ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {selected.title && (
                    <h4 className="text-[14.5px] font-semibold text-gray-900 leading-snug tracking-tight mb-2">
                      {selected.title}
                    </h4>
                  )}

                  <div className="text-[13px] leading-relaxed text-gray-600 whitespace-pre-line">
                    <p className={!isPostExpanded && (selected.content?.length > 240) ? 'line-clamp-3' : ''}>
                      {postBody || 'No post text available.'}
                    </p>
                    {selected.content?.length > 240 && (
                      <button
                        type="button"
                        onClick={() => setIsPostExpanded(v => !v)}
                        className="mt-1 text-[11.5px] font-semibold text-blue-600 hover:underline cursor-pointer"
                      >
                        {isPostExpanded ? 'Show less' : 'Show full post'}
                      </button>
                    )}
                  </div>

                  {selected.matchedKeyword && (
                    <div className="mt-2.5 flex items-center">
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200/60 font-normal">
                        Rule match: <strong className="text-gray-700 font-medium">&ldquo;{selected.matchedKeyword}&rdquo;</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Draft Reply Composition Surface */}
                {(() => {
                  const charCount = draftContent.length
                  const wordCount = draftContent.trim() ? draftContent.trim().split(/\s+/).length : 0
                  const readTimeSeconds = Math.max(1, Math.round((wordCount / 200) * 60))
                  const platformLimit = PLATFORM_CHAR_LIMITS[selected.platform?.toLowerCase() || '']
                  const isOverLimit = Boolean(platformLimit && charCount > platformLimit)
                  const isEdited = draftContent !== originalDraftRef.current && Boolean(originalDraftRef.current)

                  return (
                    <div className="rounded-2xl border border-gray-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-200 focus-within:border-gray-900/30 focus-within:ring-4 focus-within:ring-gray-900/[0.04]">
                      {/* Card Header Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gray-50/70 border-b border-gray-100">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[13px] font-semibold text-gray-900 tracking-tight">
                            Draft response
                          </span>

                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200/60">
                            <PlatformIcon platform={selected.platform} size="sm" />
                            <span className="capitalize">{selected.platform}</span>
                          </span>

                          {isEdited ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                              Edited
                            </span>
                          ) : draftContent ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              AI drafted
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isEdited && originalDraftRef.current && (
                            <button
                              type="button"
                              onClick={() => setDraftContent(originalDraftRef.current)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11.5px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                              title="Revert to original AI draft"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Revert</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={handleRegenerate}
                            disabled={isRegenerating || isSending}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-200/80 transition-all cursor-pointer disabled:opacity-40 shadow-2xs active:scale-[0.98]"
                          >
                            <RefreshCcw className={`h-3 w-3 text-gray-500 ${isRegenerating ? 'animate-spin text-gray-900' : ''}`} />
                            <span>{isRegenerating ? 'Regenerating…' : 'Regenerate'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Notice banner if manual drafting is needed */}
                      {!draftContent && MANUAL_DRAFT_REASON_LABELS[selected.automationReason] && (
                        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50/80 border-b border-amber-200/50 text-[11.5px] text-amber-900">
                          <div className="flex items-center gap-2 min-w-0">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <span className="truncate">{MANUAL_DRAFT_REASON_LABELS[selected.automationReason]}</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleRegenerate}
                            disabled={isRegenerating || isSending}
                            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-amber-100/80 border border-amber-200 text-[11px] font-semibold text-amber-900 transition-colors shadow-2xs cursor-pointer"
                          >
                            <RefreshCcw className={`h-2.5 w-2.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                            Generate draft
                          </button>
                        </div>
                      )}

                      {/* Seamless Textarea without inner borders */}
                      <div className="p-4 sm:p-5">
                        <textarea
                          value={draftContent}
                          onChange={e => setDraftContent(e.target.value)}
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                              e.preventDefault()
                              if (draftContent && !isSending && !currentQuality?.blocksAutomation) {
                                void handleApproveAndSend()
                              }
                            }
                          }}
                          aria-label="Reply draft"
                          className="w-full bg-transparent p-0 text-[14px] sm:text-[14.5px] leading-[1.68] text-gray-900 placeholder:text-gray-400 resize-y focus:outline-none transition-colors min-h-[130px] font-normal tracking-[-0.01em]"
                          rows={5}
                          spellCheck
                          placeholder="Write your reply, or regenerate when AI drafting is available."
                        />
                      </div>

                      {/* Card Footer with stats, quality, and shortcut */}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-gray-50/50 border-t border-gray-100 text-[11.5px] text-gray-500">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className={`tabular-nums font-medium ${isOverLimit ? 'text-rose-600 font-semibold' : 'text-gray-700'}`}>
                            {charCount} chars{platformLimit ? ` / ${platformLimit}` : ''}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="tabular-nums text-gray-500">
                            {wordCount} words
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="tabular-nums text-gray-400">
                            ~{readTimeSeconds}s read
                          </span>
                          {isOverLimit && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                              Over limit
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {currentQuality && !currentQuality.blocksAutomation ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Quality checked
                            </span>
                          ) : null}

                          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-gray-400 font-normal">
                            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 border border-gray-200 rounded text-gray-600">⌘↵</kbd>
                            <span>to post</span>
                          </span>
                        </div>
                      </div>

                      {/* Quality Issues warning banner */}
                      {draftContent && currentQuality?.blocksAutomation && (
                        <div className="border-t border-amber-200/80 bg-amber-50/80 px-4 py-2.5 space-y-1">
                          {currentQuality.issues.map(issue => (
                            <div key={issue.code} className="flex items-start gap-2 text-[11.5px] text-amber-900">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                              <span>{issue.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Bottom Action Footer */}
              <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-2.5 flex items-center justify-between gap-4">
                <div className="hidden min-w-0 flex-1 truncate text-[12px] text-gray-400 font-normal sm:block">
                  {selected?.platform === 'reddit'
                    ? 'Your reply is copied and the Reddit post opens in a new tab.'
                    : 'Your reply will be published to the connected account.'}
                </div>

                {(() => {
                  const isReddit = selected?.platform === 'reddit'
                  const isMarkAsPosted = manualPostReadyId === selected?.id
                  const isDisabled = !draftContent || isSending || currentQuality?.blocksAutomation

                  return (
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDismiss}
                        className="h-8.5 px-3 text-[12px] font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Dismiss
                      </button>

                      <button
                        type="button"
                        onClick={handleCopy}
                        disabled={!draftContent}
                        className="h-8.5 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 transition-colors shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                        <span>{copied ? 'Copied' : 'Copy reply'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleApproveAndSend}
                        disabled={isDisabled}
                        className={`h-8.5 px-4 inline-flex items-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-all shadow-xs cursor-pointer ${
                          isDisabled
                            ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none'
                            : isMarkAsPosted
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99]'
                            : isReddit
                            ? 'bg-[#FF4500] text-white hover:bg-[#E03D00] active:scale-[0.99]'
                            : 'bg-gray-900 text-white hover:bg-black active:scale-[0.99]'
                        }`}
                      >
                        {isSending ? (
                          <><RefreshCcw className="h-3.5 w-3.5 animate-spin" /> Preparing...</>
                        ) : isMarkAsPosted ? (
                          <><CheckCircle className="h-3.5 w-3.5" /> Mark as Posted</>
                        ) : !draftContent ? (
                          <>Write reply to post</>
                        ) : isReddit ? (
                          <><RedditIcon className="h-3.5 w-3.5" /> Copy &amp; open Reddit</>
                        ) : (
                          <><CheckCircle className="h-3.5 w-3.5" /> Post to Bluesky</>
                        )}
                      </button>
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 text-gray-400">
                <CheckCircle className="h-7 w-7 text-emerald-600/80" strokeWidth={1.75} />
              </div>
              <p className="text-[15px] font-semibold text-gray-900 mb-1">
                {loading ? 'Loading reply queue…' : 'Reply queue is clear'}
              </p>
              <p className="text-[13px] text-gray-500 max-w-[280px] leading-relaxed">
                {loading ? '' : 'Generate a draft from Review leads to begin editing and publishing.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppPage>
  )
}
