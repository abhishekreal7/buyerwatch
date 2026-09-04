'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  MessageCircle,
  Search,
  Sparkles,
  Target,
  X,
  Copy,
  Check,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppPage } from '@/components/AppPage'
import { BlueskyIcon, RedditIcon, XIcon } from '@/components/Icons'
import { PageHeader } from '@/components/PageHeader'
import { ACTIONABLE_INTENT_THRESHOLD, getIntentDisplayLabel, type IntentLabel } from '@/lib/intent'
import { createClient } from '@/utils/supabase/client'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import { useDashboardSession } from '@/components/DashboardContext'
import { IntentBadge } from '@/components/IntentBadge'
import { DataLoadError } from '@/components/DataLoadError'
import { OpportunityStageNav } from '@/components/OpportunityStageNav'

const FILTERS = ['All', 'Buying intent', 'Researching', 'Reddit', 'Bluesky', 'X']
const PAGE_SIZE = 60

type OpportunityStatus = 'pending' | 'drafted' | 'needs_manual_reply'

type Opportunity = {
  id: string
  platform: string
  author: string
  target: string
  createdAt: string
  title: string
  content: string
  score: number | null
  label: string
  intentLabel?: IntentLabel
  keyword: string
  reasoning: string
  matchedSignals: string[]
  qualityIssues: string[]
  automationReason: string
  url: string | null
  status: OpportunityStatus
  flag?: string
}

const AUTOMATION_REASON_LABELS: Record<string, string> = {
  auto_send_requires_paid_plan: 'Manual review is required on the current plan.',
  auto_send_disabled: 'Manual review is enabled in your settings.',
  reply_quality_blocked: 'The draft needs edits before it can be considered for automation.',
  missing_disclosure: 'The draft needs an affiliation disclosure.',
  intent_score_unavailable: 'A verified high-intent score is required before automation can run.',
  below_high_intent_threshold: 'This conversation is below your configured high-intent threshold.',
  cold_start_insufficient_data: 'Manual review is required until enough approval history exists.',
  below_dynamic_threshold: 'The draft did not clear your confidence threshold.',
  draft_budget_exhausted: 'The monthly AI draft allowance was reached.',
  auto_send_platform_disabled: 'Automation is not enabled for this platform.',
  platform_connection_required: 'Connect this platform before direct posting can be considered.',
  auto_send_target_out_of_scope: 'This community is outside your approved automation scope.',
  assisted_delivery_required: 'This platform requires your review and final submit.',
  preflight_ai_bypassed: 'This match was scored deterministically and needs your review.',
  intent_provider_failed: 'AI intent scoring was unavailable, so BuyerWatch preserved the deterministic match for your review.',
  intent_spend_limit_reached: 'The AI scoring budget was reached, so BuyerWatch preserved the deterministic match for your review.',
  intent_plan_limit_reached: 'The daily AI scoring allowance was reached, so BuyerWatch preserved the deterministic match for your review.',
  ai_provider_unavailable: 'AI drafting is unavailable. You can write and send this reply manually.',
  ai_spend_limit_reached: 'The AI drafting budget was reached. You can write and send this reply manually.',
  draft_plan_limit_reached: 'The AI draft allowance was reached. You can write and send this reply manually.',
  draft_provider_failed: 'AI drafting failed, but the conversation was preserved so you can write the reply manually.',
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
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 1000))
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h ago`
  const days = Math.floor(elapsedSeconds / 86400)
  return `${days}d ago`
}

function getKeywordRelation(value: unknown): { term?: string; target?: string } {
  if (Array.isArray(value)) return (value[0] ?? {}) as { term?: string; target?: string }
  return (value ?? {}) as { term?: string; target?: string }
}

function parseOpportunities(data: any[]): Opportunity[] {
  return data.map(thread => {
    const keyword = getKeywordRelation(thread.keywords)
    const score = thread.intent_score === null ? null : Number(thread.intent_score)
    const intentLabel = thread.intent_label as IntentLabel | undefined
    return {
      id: thread.id,
      platform: thread.platform,
      author: thread.author || 'Unknown author',
      target: keyword.target || thread.platform,
      createdAt: thread.source_created_at || thread.created_at,
      title: thread.title || '',
      content: thread.text_content || '',
      score,
      label: score === null ? 'Awaiting analysis' : getIntentDisplayLabel(intentLabel, score),
      intentLabel,
      keyword: keyword.term || 'Monitoring rule',
      reasoning: thread.score_reasoning || '',
      matchedSignals: Array.isArray(thread.matched_signals) ? thread.matched_signals : [],
      qualityIssues: Array.isArray(thread.quality_issues) ? thread.quality_issues : [],
      automationReason: thread.automation_reason || '',
      url: thread.url || null,
      status: thread.status as OpportunityStatus,
      flag: thread.flag || undefined,
    }
  })
}

// ─── Left Panel: Compact Lead Row ───────────────────────────────────────────

function LeadRow({
  opportunity,
  isActive,
  onClick,
}: {
  opportunity: Opportunity
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl p-3.5 transition-all duration-150 relative group ${
        isActive
          ? 'bg-white shadow-[0_4px_14px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] ring-2 ring-neutral-900'
          : 'bg-white/70 hover:bg-white hover:shadow-xs ring-1 ring-black/[0.05]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className={`text-[13px] font-bold leading-snug line-clamp-1 transition-colors ${
          isActive ? 'text-[#1C1C1A]' : 'text-[#2C2C28] group-hover:text-black'
        }`}>
          {opportunity.title || opportunity.keyword || 'Conversation Lead'}
        </h4>
        <IntentBadge score={opportunity.score} label={opportunity.label} className="shrink-0 text-[10px]" />
      </div>

      <p className="text-[12px] text-[#6B6B66] line-clamp-2 leading-relaxed mb-2.5">
        {opportunity.content || opportunity.reasoning}
      </p>

      <div className="flex items-center gap-1.5 text-[11px] text-[#8C8C85]">
        <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.03] px-1.5 py-0.5 font-medium text-[#4A4A45]">
          <PlatformIcon platform={opportunity.platform} />
          <span className="truncate max-w-[85px]">{opportunity.target}</span>
        </span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums font-medium">{formatTimeAgo(opportunity.createdAt)}</span>
        {opportunity.flag === 'COMPETITOR_RISK' && (
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md ring-1 ring-amber-600/20">
            Competitor
          </span>
        )}
        <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-30 group-hover:opacity-70 transition-opacity shrink-0" />
      </div>
    </button>
  )
}

// ─── Right Panel: Full Detail View ───────────────────────────────────────────

function DetailPanel({
  opportunity,
  draftingId,
  onDraftReply,
  onClose,
}: {
  opportunity: Opportunity
  draftingId: string | null
  onDraftReply: (id: string) => void
  onClose: () => void
}) {
  const [reasoningOpen, setReasoningOpen] = useState(true)
  const [copiedPost, setCopiedPost] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleCopyPost = async () => {
    if (!opportunity.content) return
    try {
      await navigator.clipboard.writeText(opportunity.content)
      setCopiedPost(true)
      setTimeout(() => setCopiedPost(false), 2000)
      toast.success('Post text copied')
    } catch {
      toast.error('Could not copy post text')
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Detail Header */}
      <div className="shrink-0 flex items-center justify-between gap-4 border-b border-black/[0.06] bg-white px-6 py-3.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F5F5F3] shadow-xs">
            <PlatformIcon platform={opportunity.platform} size="md" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-[#1C1C1A] truncate">{opportunity.target}</span>
              <IntentBadge score={opportunity.score} label={opportunity.label} className="text-[10.5px]" />
            </div>
            <span className="block truncate text-[11.5px] font-medium text-[#8C8C85]">
              by <span className="text-[#4A4A45] font-semibold">{opportunity.author}</span> · {formatTimeAgo(opportunity.createdAt)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.08] bg-white text-[#8C8C85] hover:bg-gray-100 hover:text-black transition-colors shadow-2xs shrink-0"
          title="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>

        {/* Title + Content Card */}
        <div className="rounded-2xl border border-black/[0.07] bg-[#FAFAF8] p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8C8C85]">
              Conversation Details
            </span>
            <button
              type="button"
              onClick={handleCopyPost}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8C8C85] hover:text-[#1C1C1A] transition-colors"
            >
              {copiedPost ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              <span>{copiedPost ? 'Copied' : 'Copy text'}</span>
            </button>
          </div>

          {opportunity.title && (
            <h2 className="text-[16px] font-bold leading-snug tracking-tight text-[#1C1C1A] mb-2">
              {opportunity.title}
            </h2>
          )}
          <div className="text-[13.5px] leading-relaxed text-[#3D3D39] whitespace-pre-line">
            <p className={!isExpanded && (opportunity.content?.length > 280) ? 'line-clamp-4' : ''}>
              {opportunity.content}
            </p>
            {opportunity.content?.length > 280 && (
              <button
                type="button"
                onClick={() => setIsExpanded(v => !v)}
                className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#0A84FF] hover:underline"
              >
                {isExpanded ? (
                  <>Show less <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>Show full post <ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-black/[0.05] flex items-center gap-1.5 text-[11.5px] text-[#8C8C85]">
            <span>Matched keyword rule:</span>
            <span className="font-semibold text-[#4A4A45] bg-white px-2 py-0.5 rounded-md border border-black/[0.06]">
              &ldquo;{opportunity.keyword}&rdquo;
            </span>
          </div>
        </div>

        {/* AI Intent & Reasoning Inspector */}
        {opportunity.reasoning && (
          <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-b from-white to-blue-50/20 shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setReasoningOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-50/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-blue-100 text-[#0A84FF]">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-[13px] font-bold text-[#1C1C1A]">Why this opportunity matters</span>
              </div>
              {reasoningOpen
                ? <ChevronUp className="h-4 w-4 text-[#8C8C85]" />
                : <ChevronDown className="h-4 w-4 text-[#8C8C85]" />}
            </button>
            {reasoningOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-blue-100/60">
                <p className="text-[13px] leading-relaxed text-[#4A4A45]">
                  {opportunity.reasoning}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Matched Signals */}
        {opportunity.matchedSignals.length > 0 && (
          <div className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-xs">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8C8C85] uppercase tracking-wider mb-2.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span>Detected Intent Signals</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {opportunity.matchedSignals.map(signal => (
                <span
                  key={signal}
                  className="rounded-lg bg-[#F5F5F3] border border-black/[0.05] px-2.5 py-1 text-[11.5px] font-medium text-[#4A4A45]"
                >
                  {signal}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Automation Note */}
        {opportunity.automationReason && opportunity.automationReason !== 'confidence_cleared' && (
          <div className="rounded-xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-[12px] leading-relaxed text-amber-900 shadow-2xs">
            <span className="font-bold">Review notice: </span>
            {AUTOMATION_REASON_LABELS[opportunity.automationReason] || 'This reply requires manual review.'}
            {opportunity.qualityIssues.length > 0 && (
              <span className="ml-1 text-amber-800">
                Checks: {opportunity.qualityIssues.join(', ').replaceAll('_', ' ')}.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sticky Action Footer */}
      <div className="shrink-0 px-6 py-4 border-t border-black/[0.06] bg-white/95 backdrop-blur-sm flex items-center justify-between gap-3">
        {opportunity.url ? (
          <a
            href={opportunity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-black/[0.1] bg-white px-4 text-[13px] font-bold text-[#4A4A45] hover:bg-gray-50 active:scale-[0.99] transition-all shadow-2xs"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View source
          </a>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={() => onDraftReply(opportunity.id)}
          disabled={draftingId === opportunity.id}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-900 px-5 text-[13.5px] font-bold text-white hover:bg-black active:scale-[0.99] transition-all disabled:opacity-50 shadow-sm"
        >
          <Sparkles className="h-4 w-4 text-blue-400" />
          {draftingId === opportunity.id ? 'Drafting…' : 'Generate draft'}
        </button>
      </div>
    </div>
  )
}

// ─── Empty Detail Placeholder ─────────────────────────────────────────────────

function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-white">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F5F5F3] shadow-inner text-[#8C8C85]">
        <Target className="h-8 w-8 text-[#0A84FF]/80" strokeWidth={1.75} />
      </div>
      <p className="text-[16px] font-bold text-[#1C1C1A] mb-1">Select an opportunity</p>
      <p className="text-[13px] text-[#8C8C85] max-w-[260px] leading-relaxed">
        Pick a lead from the list on the left to inspect its context, intent scoring, and generate a reply.
      </p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const router = useRouter()
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()
  const [activeFilter, setActiveFilter] = useState('All')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [replyQueueCount, setReplyQueueCount] = useState(0)
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchOpportunities() {
      setLoading(true)
      setLoadFailed(false)

      try {
        const [pageResult, countResult, replyQueueCountResult] = await Promise.all([
          supabase
            .from('monitored_threads')
            .select('id, platform, author, title, text_content, intent_score, intent_label, score_reasoning, matched_signals, quality_issues, automation_reason, url, status, flag, source_created_at, created_at, keywords(term, target)')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .not('intent_score', 'is', null)
            .gte('intent_score', ACTIONABLE_INTENT_THRESHOLD)
            .order('source_created_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .range(0, PAGE_SIZE - 1),
          supabase
            .from('monitored_threads')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'pending')
            .not('intent_score', 'is', null)
            .gte('intent_score', ACTIONABLE_INTENT_THRESHOLD),
          supabase
            .from('monitored_threads')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('status', ['drafted', 'needs_manual_reply']),
        ])
        if (pageResult.error) throw pageResult.error
        if (countResult.error) throw countResult.error
        if (replyQueueCountResult.error) throw replyQueueCountResult.error

        const data = pageResult.data
        const parsed = parseOpportunities(data ?? [])
        setOpportunities(parsed)
        setTotalCount(countResult.count ?? data?.length ?? 0)
        setReplyQueueCount(replyQueueCountResult.count ?? 0)
        setHasMore((data?.length ?? 0) === PAGE_SIZE)
        setSelectedId(parsed[0]?.id ?? null)
      } catch (error) {
        console.error('[opportunities] Unable to load opportunities', error)
        toast.error('Unable to load opportunities.')
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    }
    void fetchOpportunities()
  }, [loadAttempt, supabase, userId])

  async function loadMoreOpportunities() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const from = opportunities.length
      const { data, error } = await supabase
        .from('monitored_threads')
        .select('id, platform, author, title, text_content, intent_score, intent_label, score_reasoning, matched_signals, quality_issues, automation_reason, url, status, flag, source_created_at, created_at, keywords(term, target)')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .not('intent_score', 'is', null)
        .gte('intent_score', ACTIONABLE_INTENT_THRESHOLD)
        .order('source_created_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error

      setOpportunities(current => [...current, ...parseOpportunities(data ?? [])])
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
    } catch (error) {
      console.error('[opportunities] Unable to load more opportunities', error)
      toast.error('Unable to load more opportunities.')
    } finally {
      setLoadingMore(false)
    }
  }

  const handleDraftReply = async (id: string) => {
    if (draftingId) return
    setDraftingId(id)
    try {
      const response = await fetch('/api/replies/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Failed to generate draft')
      }
      clearSupabaseReadCache()
      setReplyQueueCount(current => current + 1)
      setOpportunities(current => current.filter(opportunity => opportunity.id !== id))
      setTotalCount(current => Math.max(0, current - 1))
      toast.success('Draft ready. Opening the reply queue.')
      router.push(`/opportunities/replies?thread=${encodeURIComponent(id)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate draft')
    } finally {
      setDraftingId(null)
    }
  }

  const filtered = useMemo(() => opportunities
    .filter(opportunity => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesTitle = opportunity.title.toLowerCase().includes(q)
        const matchesContent = opportunity.content.toLowerCase().includes(q)
        const matchesAuthor = opportunity.author.toLowerCase().includes(q)
        const matchesTarget = opportunity.target.toLowerCase().includes(q)
        const matchesKeyword = opportunity.keyword.toLowerCase().includes(q)
        if (!matchesTitle && !matchesContent && !matchesAuthor && !matchesTarget && !matchesKeyword) return false
      }
      if (activeFilter === 'All') return true
      if (activeFilter === 'Buying intent') return opportunity.intentLabel === 'buying'
      if (activeFilter === 'Researching') return opportunity.intentLabel === 'researching'
      if (activeFilter === 'Reddit') return opportunity.platform === 'reddit'
      if (activeFilter === 'Bluesky') return opportunity.platform === 'bluesky'
      if (activeFilter === 'X') return opportunity.platform === 'x'
      return true
    })
    .sort((a, b) => {
      const aScore = a.score ?? -1
      const bScore = b.score ?? -1
      return sortOrder === 'desc' ? bScore - aScore : aScore - bScore
    }), [activeFilter, opportunities, searchQuery, sortOrder])

  useEffect(() => {
    setSelectedId((current) => {
      if (current !== null && filtered.some(opportunity => opportunity.id === current)) return current
      return filtered[0]?.id ?? null
    })
  }, [filtered])

  const selectedOpportunity = filtered.find(o => o.id === selectedId) ?? null

  return (
    <AppPage>
      <div className="flex w-full flex-col">

        {/* ── Top Bar ─────────────────────────────────────────────── */}
        <PageHeader
          title="Opportunities"
          action={(
            <div className="flex items-center gap-2 rounded-full bg-gray-900 px-3.5 py-1 text-[12px] font-semibold text-white shadow-sm ring-1 ring-black/5">
              <span className="relative flex h-2 w-2 items-center justify-center">
                {opportunities.length > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-[#0A84FF] opacity-50" />}
                <span className={`h-1.5 w-1.5 rounded-full ${opportunities.length > 0 ? 'bg-[#0A84FF]' : 'bg-white/40'}`} />
              </span>
              {totalCount + replyQueueCount} active
            </div>
          )}
        />

        <OpportunityStageNav activeStage="review" reviewCount={totalCount} replyCount={replyQueueCount} />

        {/* ── Filter & Search Toolbar ──────────────────────────────── */}
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl bg-[#F4F4F2]/80 border border-black/[0.06]">
            {FILTERS.map(filter => (
              <span key={filter} className="flex items-center">
                {filter === 'Reddit' && (
                  <span className="mx-1.5 h-4 w-px bg-black/[0.1] shrink-0" aria-hidden="true" />
                )}
                <button
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  aria-pressed={activeFilter === filter}
                  className={`min-h-8 whitespace-nowrap rounded-lg px-3 py-1 text-[12.5px] transition-all duration-150 ${
                    activeFilter === filter
                      ? 'bg-white font-bold text-[#1C1C1A] shadow-xs ring-1 ring-black/[0.06]'
                      : 'font-medium text-[#6B6B66] hover:bg-white/60 hover:text-[#1C1C1A]'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {filter === 'Reddit' && <RedditIcon className="w-3.5 h-3.5 text-[#FF4500]" />}
                    {filter === 'Bluesky' && <BlueskyIcon className="w-3.5 h-3.5 text-[#0085FF]" />}
                    {filter === 'X' ? <XIcon className="w-3.5 h-3.5 text-[#0F1419]" /> : filter}
                  </span>
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8C8C85] pointer-events-none" strokeWidth={2} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search opportunities"
                placeholder="Search leads..."
                className="h-8 w-44 rounded-lg border border-black/[0.1] bg-white pl-8 pr-2 text-xs font-normal text-[#1C1C1A] placeholder-[#8C8C85] focus:border-[#0A84FF] focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/15 transition-all shadow-2xs"
              />
            </div>
            {/* Sort */}
            <button
              type="button"
              onClick={() => setSortOrder(curr => curr === 'desc' ? 'asc' : 'desc')}
              aria-label={`Sort by intent ${sortOrder === 'desc' ? 'ascending' : 'descending'}`}
              className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-black/[0.1] bg-white px-2.5 text-[12px] font-semibold text-[#4A4A45] transition-all hover:bg-gray-50 shadow-2xs"
            >
              {sortOrder === 'desc' ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              <span>Sort: Intent</span>
            </button>
          </div>
        </div>

        {/* ── Split Panel Body ────────────────────────────────────── */}
        {loading ? (
          <div className="h-[calc(100vh-280px)] min-h-[460px] rounded-2xl border border-black/[0.08] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.03)] grid grid-cols-[380px_1fr] overflow-hidden">
            <div className="border-r border-black/[0.06] bg-[#FAFAF9]/80 space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[96px] animate-pulse rounded-xl bg-white border border-black/[0.04]" />
              ))}
            </div>
            <div className="flex items-center justify-center">
              <div className="h-6 w-32 animate-pulse rounded-full bg-gray-100" />
            </div>
          </div>
        ) : loadFailed ? (
          <DataLoadError
            title="Couldn’t load opportunities"
            description="Your saved conversations are still safe. Check your connection and try loading them again."
            onRetry={() => setLoadAttempt(attempt => attempt + 1)}
            className="flex-1"
          />
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 rounded-2xl border border-black/[0.08] bg-white shadow-xs">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F5F5F3] text-[#0A84FF]">
              <Target className="h-8 w-8" strokeWidth={2} />
            </div>
            <h3 className="mb-1 text-[18px] font-bold text-[#1C1C1A]">No leads to review</h3>
            <p className="max-w-sm text-[13.5px] leading-relaxed text-[#8C8C85]">
              New qualified conversations will appear here. Leads move to the reply queue as soon as a draft is prepared.
            </p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row h-[calc(100vh-280px)] min-h-[460px] rounded-2xl border border-black/[0.08] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">

            {/* LEFT: Scrollable Lead List */}
            <div
              ref={listRef}
              className="overflow-y-auto border-b lg:border-b-0 lg:border-r border-black/[0.07] bg-[#FAFAF9]/80 lg:w-[380px] lg:min-w-[380px] lg:max-w-[380px] shrink-0 p-2 space-y-1.5"
              style={{ scrollbarWidth: 'thin' }}
            >
              {filtered.map(opportunity => (
                <LeadRow
                  key={opportunity.id}
                  opportunity={opportunity}
                  isActive={selectedId === opportunity.id}
                  onClick={() => setSelectedId(opportunity.id)}
                />
              ))}

              {/* Load More */}
              {hasMore && (
                <div className="px-4 py-3 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMoreOpportunities}
                    disabled={loadingMore}
                    className="rounded-full border border-black/[0.08] bg-white px-4 py-1.5 text-[11.5px] font-semibold text-[#1C1C1A] shadow-xs hover:bg-black/[0.025] disabled:opacity-50 transition-colors"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}

              {/* List count footer */}
              <div className="px-4 py-2.5 text-center">
                <span className="text-[11px] font-medium text-[#8C8C85]">{filtered.length} of {totalCount} leads to review</span>
              </div>
            </div>

            {/* RIGHT: Detail Panel */}
            <div className="flex-1 overflow-hidden bg-white">
              {selectedOpportunity ? (
                <DetailPanel
                  opportunity={selectedOpportunity}
                  draftingId={draftingId}
                  onDraftReply={handleDraftReply}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <EmptyDetail />
              )}
            </div>
          </div>
        )}
      </div>
    </AppPage>
  )
}
