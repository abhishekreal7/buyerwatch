'use client'

import { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Copy,
  Check,
  CheckCircle,
  X,
  RefreshCcw,
  ExternalLink,
  Search,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
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
import { IntentBadge } from '@/components/IntentBadge'
import { waitForReplyDelivery, type ReplySendResult } from '@/lib/reply-send-client'
import { copyAndOpenRedditReply } from '@/lib/reddit-handoff-client'
import { BILLING_ADDONS } from '@/lib/billing-addons'
import { RedditCommunityPolicyNotice } from '@/components/RedditCommunityPolicyNotice'
import { DataLoadError } from '@/components/DataLoadError'
import { OpportunityStageNav } from '@/components/OpportunityStageNav'

const PAGE_SIZE = 40

const MANUAL_DRAFT_REASON_LABELS: Record<string, string> = {
  ai_provider_unavailable: 'AI drafting is unavailable right now. You can still write and send this reply manually.',
  ai_spend_limit_reached: 'The AI drafting budget was reached. You can still write and send this reply manually.',
  draft_plan_limit_reached: 'The AI draft allowance was reached. You can still write and send this reply manually.',
  draft_provider_failed: 'AI drafting failed for this conversation. Your opportunity is safe, and you can write the reply manually or retry later.',
  intent_provider_failed: 'AI intent scoring was unavailable. Review the deterministic match before writing a reply.',
  intent_spend_limit_reached: 'The AI scoring budget was reached. Review the deterministic match before writing a reply.',
  intent_plan_limit_reached: 'The daily AI scoring allowance was reached. Review the deterministic match before writing a reply.',
  preflight_ai_bypassed: 'This conversation was scored deterministically. Review it before writing a reply.',
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
  return (
    <div className="flex items-center gap-2 rounded-full bg-gray-900 px-3.5 py-1 text-[12px] font-semibold text-white shadow-sm ring-1 ring-black/5">
      <span className="relative flex h-2 w-2 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#0A84FF] opacity-50" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#0A84FF]" aria-hidden="true" />
      </span>
      {count} active
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

        <div className="flex flex-col lg:flex-row h-[calc(100vh-210px)] min-h-[600px] rounded-2xl border border-black/[0.08] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">

          <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-black/[0.07] bg-[#FAFAF9]/80 lg:w-[380px] lg:min-w-[380px] lg:max-w-[380px] shrink-0 overflow-hidden">
            <div className="shrink-0 px-4 py-3 border-b border-black/[0.06] bg-white/70 backdrop-blur-xs flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-[#6B6B66]">
                <span className="tabular-nums font-bold text-[#1C1C1A]">{searchQuery.trim() ? filteredDrafts.length : totalCount}</span>
                {' '}replies to prepare
              </p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8C8C85] pointer-events-none" strokeWidth={2} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search drafts"
                  placeholder="Search..."
                  className="h-8 w-36 rounded-lg border border-black/[0.1] bg-white pl-8 pr-2 text-[12px] text-[#1C1C1A] placeholder-[#8C8C85] focus:border-[#0A84FF] focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/15 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[96px] animate-pulse bg-white/80 border border-black/[0.04] rounded-xl p-3.5 space-y-2">
                    <div className="h-4 bg-gray-200 rounded-md w-3/4" />
                    <div className="h-3 bg-gray-100 rounded-md w-full" />
                    <div className="h-3 bg-gray-100 rounded-md w-1/2" />
                  </div>
                ))
              ) : filteredDrafts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                  <div className="h-10 w-10 rounded-full bg-black/[0.04] grid place-items-center mb-2 text-[#8C8C85]">
                    <Search className="h-4 w-4" />
                  </div>
                  <p className="text-[13px] font-semibold text-[#4A4A45]">No matching replies</p>
                  <p className="text-[11.5px] text-[#8C8C85] mt-0.5">Try searching with a different keyword</p>
                </div>
              ) : (
                filteredDrafts.map(d => {
                  const isSelected = selected?.id === d.id
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleSelect(d)}
                      className={`w-full text-left rounded-xl p-3.5 transition-all duration-150 relative group ${
                        isSelected
                          ? 'bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.08] border-l-[3.5px] border-l-[#FF4500]'
                          : 'bg-white/60 hover:bg-white hover:shadow-xs ring-1 ring-black/[0.04] border-l-[3.5px] border-l-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className={`text-[13px] font-bold leading-snug line-clamp-1 transition-colors ${
                          isSelected ? 'text-[#1C1C1A]' : 'text-[#2C2C28] group-hover:text-black'
                        }`}>
                          {d.title || d.matchedKeyword || 'Draft reply'}
                        </h4>
                        <IntentBadge score={d.score} label={d.label} className="shrink-0 text-[10px]" />
                      </div>

                      <p className="text-[12px] text-[#6B6B66] line-clamp-2 leading-relaxed mb-2.5">
                        {d.content}
                      </p>

                      <div className="flex items-center gap-1.5 text-[11px] text-[#8C8C85]">
                        <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.03] px-1.5 py-0.5 font-medium text-[#4A4A45]">
                          <PlatformIcon platform={d.platform} />
                          <span className="truncate max-w-[85px]">
                            {d.platform === 'reddit' ? `r/${d.community}` : d.community}
                          </span>
                        </span>
                        <span className="opacity-40">·</span>
                        <span className="tabular-nums font-medium">{d.timeAgo}</span>
                        {d.draft && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md ring-1 ring-emerald-600/20">
                            <Sparkles className="h-2.5 w-2.5" />
                            Draft ready
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}

              {!loading && hasMore && (
                <div className="flex justify-center py-3">
                  <button
                    type="button"
                    onClick={loadMoreDrafts}
                    disabled={loadingMore}
                    className="rounded-full border border-black/[0.08] bg-white px-4 py-1.5 text-[11.5px] font-semibold text-[#1C1C1A] shadow-xs hover:bg-black/[0.025] disabled:opacity-50 transition-colors"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {selected ? (
            <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden">
              <div className="shrink-0 flex items-center justify-between gap-4 border-b border-black/[0.06] bg-white px-6 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F5F5F3] shadow-xs">
                    <PlatformIcon platform={selected.platform} size="md" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[14.5px] font-bold text-[#1C1C1A]">
                        {selected.platform === 'reddit' ? `r/${selected.community}` : selected.community}
                      </h3>
                      <IntentBadge score={selected.score} label={selected.label} className="text-[10.5px]" />
                    </div>
                    <span className="block truncate text-[11.5px] font-medium text-[#8C8C85]">
                      by <span className="text-[#4A4A45] font-semibold">{selected.target}</span> · {selected.timeAgo}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {selected.url && (
                    <a
                      href={selected.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0A84FF] hover:bg-blue-50/60 transition-colors shadow-2xs"
                    >
                      Open post <ExternalLink className="h-3 w-3" strokeWidth={2.5} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.08] bg-white text-[#8C8C85] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-2xs"
                    title="Dismiss opportunity"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>
                <div className="rounded-2xl border border-black/[0.07] bg-[#FAFAF8] p-4 shadow-xs transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-[#8C8C85] uppercase tracking-wider">
                      <PlatformIcon platform={selected.platform} />
                      <span>Original Post</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyPost}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8C8C85] hover:text-[#1C1C1A] transition-colors"
                      title="Copy original post text"
                    >
                      {copiedPost ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedPost ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {selected.title && (
                    <h4 className="text-[14.5px] font-bold text-[#1C1C1A] leading-snug mb-2">
                      {selected.title}
                    </h4>
                  )}

                  <div className="text-[13px] leading-relaxed text-[#3D3D39] whitespace-pre-line">
                    <p className={!isPostExpanded && (selected.content?.length > 280) ? 'line-clamp-4' : ''}>
                      {selected.content}
                    </p>
                    {selected.content?.length > 280 && (
                      <button
                        type="button"
                        onClick={() => setIsPostExpanded(v => !v)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#0A84FF] hover:underline"
                      >
                        {isPostExpanded ? (
                          <>Show less <ChevronUp className="h-3 w-3" /></>
                        ) : (
                          <>Show full post <ChevronDown className="h-3 w-3" /></>
                        )}
                      </button>
                    )}
                  </div>

                  {selected.matchedKeyword && (
                    <div className="mt-3 pt-2.5 border-t border-black/[0.05] flex items-center gap-1.5 text-[11.5px] text-[#8C8C85]">
                      <span>Matched rule:</span>
                      <span className="font-semibold text-[#4A4A45] bg-white px-2 py-0.5 rounded-md border border-black/[0.06]">
                        &ldquo;{selected.matchedKeyword}&rdquo;
                      </span>
                    </div>
                  )}
                </div>

                {selected.platform === 'reddit' && (
                  <RedditCommunityPolicyNotice subreddit={selected.community} />
                )}

                {!draftContent && MANUAL_DRAFT_REASON_LABELS[selected.automationReason] && (
                  <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200/90 bg-amber-50/80 px-3.5 py-2.5 text-[12px] font-medium leading-relaxed text-amber-900 shadow-2xs">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <span>{MANUAL_DRAFT_REASON_LABELS[selected.automationReason]}</span>
                  </div>
                )}

                <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-b from-white to-blue-50/20 p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-lg bg-blue-100 text-[#0A84FF]">
                        <Sparkles className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-[12.5px] font-bold text-[#1C1C1A]">
                        {draftContent ? 'AI Generated Reply Draft' : 'Custom Reply Draft'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        disabled={isRegenerating || isSending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-[11.5px] font-bold text-[#4A4A45] hover:bg-gray-50 hover:text-black transition-all disabled:opacity-40 shadow-2xs"
                      >
                        <RefreshCcw className={`h-3 w-3 ${isRegenerating ? 'animate-spin text-[#0A84FF]' : ''}`} />
                        {isRegenerating
                          ? (draftContent ? 'Regenerating…' : 'Generating…')
                          : (draftContent ? 'Regenerate' : 'Generate reply')}
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <textarea
                      value={draftContent}
                      onChange={e => setDraftContent(e.target.value)}
                      aria-label="Reply draft"
                      className="w-full rounded-xl border border-black/[0.1] bg-white p-3.5 text-[13.5px] leading-relaxed text-[#1C1C1A] resize-none focus:border-[#0A84FF] focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/20 transition-all font-sans"
                      rows={5}
                      spellCheck
                      placeholder="Write a reply here, or use Generate reply when AI drafting is available."
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[#8C8C85]">
                      <span className="font-medium">
                        {draftContent ? 'Personalize or edit before copying to Reddit' : 'No draft generated yet'}
                      </span>
                      <span className="tabular-nums font-semibold">{draftContent.length} chars</span>
                    </div>
                  </div>

                  {draftContent && currentQuality?.blocksAutomation && (
                    <div className="space-y-1.5 pt-1">
                      {currentQuality.issues.map(issue => (
                        <div key={issue.code} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] font-medium text-amber-900">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <span>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t border-black/[0.06] bg-white/95 backdrop-blur-sm px-6 py-4 space-y-2.5">
                {(() => {
                  const isReddit = selected?.platform === 'reddit'
                  const isMarkAsPosted = manualPostReadyId === selected?.id
                  const isDisabled = !draftContent || isSending || currentQuality?.blocksAutomation

                  return (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleApproveAndSend}
                        disabled={isDisabled}
                        className={`flex-1 flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[13.5px] font-bold transition-all shadow-sm ${
                          isDisabled
                            ? 'cursor-not-allowed border border-black/[0.06] bg-[#F2F2EF] text-[#AEAEAD]'
                            : isMarkAsPosted
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99] shadow-emerald-600/20'
                            : isReddit
                            ? 'bg-[#FF4500] text-white hover:bg-[#E03D00] active:scale-[0.99] shadow-[#FF4500]/25'
                            : 'bg-[#0085FF] text-white hover:bg-[#006FD6] active:scale-[0.99] shadow-blue-500/25'
                        }`}
                      >
                        {isSending ? (
                          <><RefreshCcw className="h-4 w-4 animate-spin" /> {isReddit ? 'Preparing...' : 'Posting...'}</>
                        ) : (
                          <><CheckCircle className="h-4 w-4" strokeWidth={2.25} /> {
                            isMarkAsPosted
                              ? 'Mark as Posted'
                              : isReddit
                                ? 'Copy & Open Reddit'
                                : 'Post through Bluesky'
                          }</>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleCopy}
                        disabled={!draftContent}
                        className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-black/[0.1] bg-white px-4 text-[13px] font-bold text-[#3D3D39] hover:bg-gray-50 active:scale-[0.99] transition-all disabled:opacity-40 shadow-2xs"
                        title="Copy draft to clipboard"
                      >
                        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-[#6B6B66]" />}
                        <span>{copied ? 'Copied!' : 'Copy text'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDismiss}
                        className="grid h-12 w-12 place-items-center rounded-xl border border-black/[0.1] bg-white text-[#6B6B66] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 active:scale-[0.98] transition-all shadow-2xs"
                        title="Dismiss lead"
                      >
                        <X className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  )
                })()}

                <p className="text-center text-[11px] text-[#8C8C85]">
                  {selected?.platform === 'reddit'
                    ? 'Clicking "Copy & Open Reddit" copies your draft to your clipboard and opens the thread in a new tab.'
                    : 'Review the draft and publish directly to the connected platform.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F5F5F3] shadow-inner text-[#8C8C85]">
                <CheckCircle className="h-8 w-8 text-emerald-600/80" strokeWidth={1.75} />
              </div>
              <p className="text-[16px] font-bold text-[#1C1C1A] mb-1">
                {loading ? 'Loading reply queue…' : 'Reply queue is clear'}
              </p>
              <p className="text-[13px] text-[#8C8C85] max-w-[280px] leading-relaxed">
                {loading ? '' : 'Generate a draft from Review leads, and it will appear here ready for final tuning and delivery.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppPage>
  )
}
