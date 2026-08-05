'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { AppPage } from '@/components/AppPage'
import { BlueskyIcon, RedditIcon, XIcon } from '@/components/Icons'
import { PageHeader } from '@/components/PageHeader'
import { getIntentDisplayLabel, type IntentLabel } from '@/lib/intent'
import { createClient } from '@/utils/supabase/client'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import { useDashboardSession } from '@/components/DashboardContext'
import { IntentBadge } from '@/components/IntentBadge'

const FILTERS = ['All', 'Buying intent', 'Researching', 'Pain signals', 'Reddit', 'Bluesky', 'X']
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
  cold_start_insufficient_data: 'Manual review is required until enough approval history exists.',
  below_dynamic_threshold: 'The draft did not clear your confidence threshold.',
  draft_budget_exhausted: 'The monthly AI draft allowance was reached.',
  auto_send_platform_disabled: 'Automation is not enabled for this platform.',
  platform_connection_required: 'Connect this platform before direct posting can be considered.',
  auto_send_target_out_of_scope: 'This community is outside your approved automation scope.',
  assisted_delivery_required: 'This platform requires your review and final submit.',
}

function PlatformIcon({ platform, size = 'sm' }: { platform: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
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
  return `${Math.floor(elapsedSeconds / 86400)}d ago`
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
      createdAt: thread.created_at,
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
      className={`w-full text-left px-4 py-3.5 border-b border-[#F0F0ED] transition-colors duration-100 group ${
        isActive
          ? 'bg-[#FFF8F5] border-l-2 border-l-[#FF5101]'
          : 'bg-white border-l-2 border-l-transparent hover:bg-[#FAFAF8]'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h4 className={`text-[13.5px] font-semibold leading-snug line-clamp-1 transition-colors ${
          isActive ? 'text-[#1C1C1A]' : 'text-[#1C1C1A] group-hover:text-[#FF5101]'
        }`}>
          {opportunity.title || opportunity.keyword || 'Conversation Lead'}
        </h4>
        <IntentBadge score={opportunity.score} label={opportunity.label} className="shrink-0 text-[10.5px]" />
      </div>

      <p className="text-[12px] text-[#6B6B66] line-clamp-2 leading-relaxed mb-2">
        {opportunity.content || opportunity.reasoning}
      </p>

      <div className="flex items-center gap-2 text-[11px] text-[#8C8C85]">
        <PlatformIcon platform={opportunity.platform} />
        <span className="font-medium text-[#4A4A45] truncate max-w-[80px]">{opportunity.target}</span>
        <span className="opacity-40">·</span>
        <span>{formatTimeAgo(opportunity.createdAt)}</span>
        {opportunity.flag === 'COMPETITOR_RISK' && (
          <>
            <span className="opacity-40">·</span>
            <span className="text-amber-600 font-semibold">Competitor</span>
          </>
        )}
        <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-30 group-hover:opacity-60 transition-opacity shrink-0" />
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Detail Header */}
      <div className="px-6 py-4 border-b border-[#EDEDEA] flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <PlatformIcon platform={opportunity.platform} size="md" />
          <span className="text-[13px] font-semibold text-[#1C1C1A] truncate">{opportunity.target}</span>
          <span className="text-[13px] text-[#8C8C85]">·</span>
          <span className="text-[13px] text-[#8C8C85] truncate">{opportunity.author}</span>
          <span className="text-[13px] text-[#8C8C85]">·</span>
          <span className="text-[12px] text-[#8C8C85]">{formatTimeAgo(opportunity.createdAt)}</span>
        </div>
        <IntentBadge score={opportunity.score} label={opportunity.label} />
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-[#8C8C85] hover:bg-[#F0F0ED] hover:text-[#1C1C1A] transition-colors shrink-0"
          title="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Title + Content */}
        <div>
          {opportunity.title && (
            <h2 className="text-[18px] font-bold leading-snug tracking-tight text-[#1C1C1A] mb-3">
              {opportunity.title}
            </h2>
          )}
          <p className="text-[14px] leading-relaxed text-[#4A4A45] whitespace-pre-line">
            {opportunity.content}
          </p>
        </div>

        {/* Matched Signals */}
        {opportunity.matchedSignals.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[#8C8C85] uppercase tracking-wider mb-2">Matched Signals</p>
            <div className="flex flex-wrap gap-1.5">
              {opportunity.matchedSignals.map(signal => (
                <span
                  key={signal}
                  className="rounded-full bg-[#F2F2EF] px-2.5 py-1 text-[11.5px] font-medium text-[#4A4A45]"
                >
                  {signal}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* AI Reasoning */}
        {opportunity.reasoning && (
          <div className="rounded-xl border border-[#E8E8E5] bg-[#FAFAF8] overflow-hidden">
            <button
              type="button"
              onClick={() => setReasoningOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-[12px] font-semibold text-[#4A4A45]">Why this opportunity matters</span>
              {reasoningOpen
                ? <ChevronUp className="h-4 w-4 text-[#8C8C85]" />
                : <ChevronDown className="h-4 w-4 text-[#8C8C85]" />}
            </button>
            {reasoningOpen && (
              <p className="px-4 pb-4 pt-0 text-[13px] leading-relaxed text-[#5A5A55] border-t border-[#E8E8E5]">
                {opportunity.reasoning}
              </p>
            )}
          </div>
        )}

        {/* Automation Note */}
        {opportunity.automationReason && opportunity.automationReason !== 'confidence_cleared' && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-[12.5px] leading-relaxed text-amber-800">
            <span className="font-semibold">Review status: </span>
            {AUTOMATION_REASON_LABELS[opportunity.automationReason] || 'This reply requires manual review.'}
            {opportunity.qualityIssues.length > 0 && (
              <span className="ml-1 text-amber-700">
                Checks: {opportunity.qualityIssues.join(', ').replaceAll('_', ' ')}.
              </span>
            )}
          </div>
        )}

        {/* Keyword Match */}
        <div className="flex items-center gap-1.5 text-[12px] text-[#8C8C85]">
          <span>Matched keyword:</span>
          <span className="font-semibold text-[#4A4A45]">&ldquo;{opportunity.keyword}&rdquo;</span>
        </div>
      </div>

      {/* Sticky Footer Actions */}
      <div className="shrink-0 px-6 py-4 border-t border-[#EDEDEA] bg-white flex items-center gap-3">
        {opportunity.url && (
          <a
            href={opportunity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-[#DEDEDA] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#4A4A45] hover:bg-[#F7F7F4] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View source
          </a>
        )}
        <div className="flex-1" />
        {opportunity.status === 'pending' ? (
          <button
            type="button"
            onClick={() => onDraftReply(opportunity.id)}
            disabled={draftingId === opportunity.id}
            className="flex items-center gap-2 rounded-lg bg-[#1C1C1A] px-4 py-2 text-[13px] font-semibold text-white hover:bg-black transition-colors disabled:opacity-50 shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {draftingId === opportunity.id ? 'Drafting…' : 'Generate draft'}
          </button>
        ) : (
          <Link
            href="/drafts"
            className="flex items-center gap-2 rounded-lg bg-[#1C1C1A] px-4 py-2 text-[13px] font-semibold text-white hover:bg-black transition-colors shadow-sm"
          >
            {opportunity.status === 'drafted' ? 'Review draft' : 'Write reply'}
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Empty Detail Placeholder ─────────────────────────────────────────────────

function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F2F2EF]">
        <Target className="h-7 w-7 text-[#8C8C85]" strokeWidth={1.75} />
      </div>
      <p className="text-[14px] font-semibold text-[#4A4A45] mb-1">Select an opportunity</p>
      <p className="text-[13px] text-[#8C8C85] max-w-[240px] leading-relaxed">
        Pick a lead from the list on the left to review its full details and generate a reply.
      </p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()
  const [activeFilter, setActiveFilter] = useState('All')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchOpportunities() {
      const [pageResult, countResult] = await Promise.all([
        supabase
          .from('monitored_threads')
          .select('id, platform, author, title, text_content, intent_score, intent_label, score_reasoning, matched_signals, quality_issues, automation_reason, url, status, flag, created_at, keywords(term, target)')
          .eq('user_id', userId)
          .in('status', ['pending', 'drafted', 'needs_manual_reply'])
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1),
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', ['pending', 'drafted', 'needs_manual_reply']),
      ])
      const { data, error } = pageResult
      if (error) {
        toast.error('Unable to load opportunities.')
        setLoading(false)
        return
      }
      const parsed = parseOpportunities(data ?? [])
      setOpportunities(parsed)
      setTotalCount(countResult.count ?? data?.length ?? 0)
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
      if (parsed.length > 0) setSelectedId(parsed[0].id)
      setLoading(false)
    }
    void fetchOpportunities()
  }, [supabase, userId])

  async function loadMoreOpportunities() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const from = opportunities.length
    const { data, error } = await supabase
      .from('monitored_threads')
      .select('id, platform, author, title, text_content, intent_score, intent_label, score_reasoning, matched_signals, quality_issues, automation_reason, url, status, flag, created_at, keywords(term, target)')
      .eq('user_id', userId)
      .in('status', ['pending', 'drafted', 'needs_manual_reply'])
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      toast.error('Unable to load more opportunities.')
    } else {
      setOpportunities(current => [...current, ...parseOpportunities(data ?? [])])
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
    }
    setLoadingMore(false)
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
        throw new Error(payload?.error || 'Failed to generate draft')
      }
      clearSupabaseReadCache()
      setOpportunities(current => current.map(opportunity => (
        opportunity.id === id ? { ...opportunity, status: 'drafted' } : opportunity
      )))
      toast.success('Draft ready for review.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate draft')
    } finally {
      setDraftingId(null)
    }
  }

  const filtered = opportunities
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
      if (activeFilter === 'Pain signals') return opportunity.intentLabel === 'complaining'
      if (activeFilter === 'Reddit') return opportunity.platform === 'reddit'
      if (activeFilter === 'Bluesky') return opportunity.platform === 'bluesky'
      if (activeFilter === 'X') return opportunity.platform === 'x'
      return true
    })
    .sort((a, b) => {
      const aScore = a.score ?? -1
      const bScore = b.score ?? -1
      return sortOrder === 'desc' ? bScore - aScore : aScore - bScore
    })

  const selectedOpportunity = filtered.find(o => o.id === selectedId) ?? null

  return (
    <AppPage>
      <div className="flex w-full flex-col" style={{ height: 'calc(100vh - 56px)' }}>

        {/* ── Top Bar ─────────────────────────────────────────────── */}
        <PageHeader
          title="Opportunities"
          action={(
            <div className="flex items-center gap-2 rounded-full bg-gray-900 px-3 py-1 text-[12px] font-medium text-white shadow-sm ring-1 ring-black/5">
              <span className="relative flex h-2 w-2 items-center justify-center">
                {opportunities.length > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-[#0A84FF] opacity-40" />}
                <span className={`h-1.5 w-1.5 rounded-full ${opportunities.length > 0 ? 'bg-[#0A84FF]' : 'bg-white/40'}`} />
              </span>
              {totalCount} active
            </div>
          )}
        />

        {/* ── Filter Bar ──────────────────────────────────────────── */}
        <div className="mb-0 flex flex-col gap-3 border-y border-[#E7E7E3] py-3 sm:flex-row sm:items-center sm:justify-between px-0 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {FILTERS.map(filter => (
              <span key={filter} className="flex items-center">
                {filter === 'Reddit' && (
                  <span className="mx-2 h-5 w-px bg-[#E0E0DC] shrink-0" aria-hidden="true" />
                )}
                <button
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`min-h-9 whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[13px] transition-colors duration-150 ${
                    activeFilter === filter
                      ? 'bg-[#EFEFEC] font-semibold text-text-primary'
                      : 'font-medium text-text-secondary hover:bg-[#F6F6F3] hover:text-text-primary'
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
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" strokeWidth={2} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search thread"
                className="h-9 w-48 rounded-[10px] border border-[#DEDEDA] bg-white pl-9 pr-4 text-xs font-normal text-gray-800 placeholder-gray-400 focus:border-[#0A84FF] focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/15"
              />
            </div>
            {/* Sort */}
            <button
              type="button"
              onClick={() => setSortOrder(curr => curr === 'desc' ? 'asc' : 'desc')}
              className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[#DEDEDA] bg-white px-3 text-[13px] font-medium text-text-secondary transition-colors hover:bg-[#F7F7F4]"
            >
              {sortOrder === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              <span className="hidden sm:inline">Sort:</span> Intent
            </button>
          </div>
        </div>

        {/* ── Split Panel Body ────────────────────────────────────── */}
        {loading ? (
          <div className="flex-1 grid grid-cols-[380px_1fr] overflow-hidden">
            <div className="border-r border-[#E7E7E3] space-y-px pt-2 px-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[88px] animate-pulse rounded-lg bg-[#F2F2EF] mb-2" />
              ))}
            </div>
            <div className="flex items-center justify-center">
              <div className="h-6 w-32 animate-pulse rounded-full bg-[#F2F2EF]" />
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Target className="h-8 w-8" strokeWidth={2.25} />
            </div>
            <h3 className="mb-2 text-[20px] font-semibold text-text-primary">No active opportunities</h3>
            <p className="max-w-sm text-[15px] leading-relaxed text-text-secondary">
              New qualified conversations will appear here with their source evidence and draft status.
            </p>
          </div>
        ) : (
          <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: '380px 1fr' }}>

            {/* LEFT: Scrollable Lead List */}
            <div
              ref={listRef}
              className="overflow-y-auto border-r border-[#E7E7E3]"
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
                <div className="px-4 py-4 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMoreOpportunities}
                    disabled={loadingMore}
                    className="rounded-full border border-black/[0.08] bg-white px-5 py-2 text-[12px] font-semibold text-text-primary shadow-xs transition-colors hover:bg-black/[0.025] disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}

              {/* List count footer */}
              <div className="px-4 py-3 text-center">
                <span className="text-[11px] text-[#8C8C85]">{filtered.length} of {totalCount} opportunities</span>
              </div>
            </div>

            {/* RIGHT: Detail Panel */}
            <div className="overflow-hidden">
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
