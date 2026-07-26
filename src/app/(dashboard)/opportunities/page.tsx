'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  AtSign,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageCircle,
  Target,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppPage } from '@/components/AppPage'
import { BlueskyIcon, RedditIcon } from '@/components/Icons'
import { PageHeader } from '@/components/PageHeader'
import { getIntentDisplayLabel, type IntentLabel } from '@/lib/intent'
import { springs, staggers } from '@/lib/motion'
import { createClient } from '@/utils/supabase/client'
import { useDashboardSession } from '@/components/DashboardContext'

const FILTERS = ['All', 'Buying intent', 'Researching', 'Pain signals', 'Reddit', 'Bluesky']

type OpportunityStatus = 'pending' | 'drafted' | 'needs_manual_reply'

type Opportunity = {
  id: string
  platform: string
  author: string
  target: string
  createdAt: string
  title: string
  content: string
  score: number
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
}

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const tone = score >= 80
    ? 'bg-success/10 text-success border-success/20'
    : score >= 60
      ? 'bg-accent/10 text-accent border-accent/20'
      : 'bg-black/[0.05] text-black/60 border-black/[0.08]'
  const dot = score >= 80 ? 'bg-success' : score >= 60 ? 'bg-accent' : 'bg-black/35'

  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-semibold ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="tabular-nums">{score}</span>
      <span className="opacity-45">/</span>
      {label}
    </div>
  )
}

function PlatformBadge({ platform }: { platform: string }) {
  const normalized = platform.toLocaleLowerCase()
  return (
    <span className="flex w-fit shrink-0 items-center gap-1.5 rounded-md bg-black/[0.04] px-2.5 py-1 text-[12px] font-medium capitalize text-text-secondary">
      {normalized === 'reddit' && <RedditIcon className="h-3.5 w-3.5 text-[#FF4500]" />}
      {normalized === 'bluesky' && <BlueskyIcon className="h-3.5 w-3.5 text-[#1185FE]" />}
      {normalized === 'x' && <AtSign className="h-3.5 w-3.5" />}
      {!['reddit', 'bluesky', 'x'].includes(normalized) && <MessageCircle className="h-3.5 w-3.5" />}
      {platform}
    </span>
  )
}

function formatTimeAgo(dateString: string) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(dateString).getTime()) / 1000),
  )
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h ago`
  return `${Math.floor(elapsedSeconds / 86400)}d ago`
}

function getKeywordRelation(value: unknown): { term?: string; target?: string } {
  if (Array.isArray(value)) return (value[0] ?? {}) as { term?: string; target?: string }
  return (value ?? {}) as { term?: string; target?: string }
}

export default function OpportunitiesPage() {
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()
  const [activeFilter, setActiveFilter] = useState('All')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchOpportunities() {
      const { data, error } = await supabase
        .from('monitored_threads')
        .select('id, platform, author, title, text_content, intent_score, intent_label, score_reasoning, matched_signals, quality_issues, automation_reason, url, status, flag, created_at, keywords(term, target)')
        .eq('user_id', userId)
        .in('status', ['pending', 'drafted', 'needs_manual_reply'])
        .order('created_at', { ascending: false })

      if (error) {
        toast.error('Unable to load opportunities.')
        return
      }

      setOpportunities((data ?? []).map(thread => {
        const keyword = getKeywordRelation(thread.keywords)
        const score = Number(thread.intent_score) || 0
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
          label: getIntentDisplayLabel(intentLabel, score),
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
      }))
    }
    fetchOpportunities()
  }, [supabase, userId])

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
      if (activeFilter === 'All') return true
      if (activeFilter === 'Buying intent') return opportunity.intentLabel === 'buying'
      if (activeFilter === 'Researching') return opportunity.intentLabel === 'researching'
      if (activeFilter === 'Pain signals') return opportunity.intentLabel === 'complaining'
      if (activeFilter === 'Reddit') return opportunity.platform === 'reddit'
      if (activeFilter === 'Bluesky') return opportunity.platform === 'bluesky'
      return true
    })
    .sort((a, b) => sortOrder === 'desc' ? b.score - a.score : a.score - b.score)

  return (
    <AppPage>
      <div className="flex w-full flex-col">
        <PageHeader
          title="Opportunities"
          subtitle="Qualified conversations with the source evidence and intent reasoning attached."
          action={(
            <div className="flex items-center gap-2 rounded-full bg-gray-900 px-3 py-1 text-[12px] font-medium text-white shadow-sm ring-1 ring-black/5">
              <span className="relative flex h-2 w-2 items-center justify-center">
                {opportunities.length > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-[#0A84FF] opacity-40" />}
                <span className={`h-1.5 w-1.5 rounded-full ${opportunities.length > 0 ? 'bg-[#0A84FF]' : 'bg-white/40'}`} />
              </span>
              {opportunities.length} active
            </div>
          )}
        />

        <div className="mb-6 flex items-center justify-between gap-3 overflow-x-auto px-1 pb-1 no-scrollbar">
          <div className="inline-flex items-center gap-1 rounded-[14px] border border-black/[0.06] bg-surface p-1 shadow-sm">
            {FILTERS.map(filter => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`min-h-11 whitespace-nowrap rounded-[10px] px-3.5 py-1.5 text-[13px] transition-all duration-150 sm:min-h-0 ${
                  activeFilter === filter
                    ? 'bg-text-primary font-semibold text-white shadow-sm'
                    : 'font-medium text-text-secondary hover:bg-black/[0.04] hover:text-text-primary'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {filter === 'Reddit' && <RedditIcon className="w-3.5 h-3.5 text-[#FF4500]" />}
                  {filter === 'Bluesky' && <BlueskyIcon className="w-3.5 h-3.5 text-[#0085FF]" />}
                  {filter}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSortOrder(current => current === 'desc' ? 'asc' : 'desc')}
            className="ml-auto flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[14px] border border-black/[0.06] bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-primary shadow-sm transition-all hover:bg-white sm:min-h-0"
          >
            {sortOrder === 'desc'
              ? <ChevronDown className="h-4 w-4 text-text-secondary" />
              : <ChevronUp className="h-4 w-4 text-text-secondary" />}
            <span className="font-medium text-text-secondary">Sort:</span> Intent
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="surface-ceramic flex flex-col items-center justify-center border border-transparent px-5 py-20 text-center sm:py-32">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Target className="h-8 w-8" strokeWidth={2.25} />
            </div>
            <h3 className="mb-2 text-[20px] font-display font-semibold text-text-primary">No active opportunities</h3>
            <p className="max-w-sm text-[15px] leading-relaxed text-text-secondary">New qualified conversations will appear here with their source evidence and draft status.</p>
          </div>
        ) : (
          <motion.div variants={staggers.container} initial="initial" animate="animate" className="space-y-4 px-1 pb-4">
            {filtered.map(opportunity => (
              <motion.article
                key={opportunity.id}
                variants={staggers.item}
                transition={springs.smooth}
                className="surface-ceramic border border-transparent p-5 sm:p-6"
              >
                <div className="mb-4 flex flex-wrap items-center gap-2.5 text-[13px] text-text-secondary">
                  <PlatformBadge platform={opportunity.platform} />
                  <span className="font-semibold text-text-primary">{opportunity.target}</span>
                  <span className="opacity-35">/</span>
                  <span>{opportunity.author}</span>
                  <span className="opacity-35">/</span>
                  <span>{formatTimeAgo(opportunity.createdAt)}</span>
                  <div className="flex-1" />
                  {opportunity.flag === 'COMPETITOR_RISK' && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Competitor mention</span>
                  )}
                  <ScoreBadge score={opportunity.score} label={opportunity.label} />
                </div>

                {opportunity.title && <h3 className="mb-2.5 text-[17px] font-semibold leading-snug tracking-tight text-text-primary">{opportunity.title}</h3>}
                <p className="mb-4 line-clamp-3 text-[15px] leading-relaxed text-text-secondary">{opportunity.content}</p>

                {opportunity.matchedSignals.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {opportunity.matchedSignals.slice(0, 4).map(signal => (
                      <span key={signal} className="rounded-full bg-black/[0.035] px-2.5 py-1 text-[11px] font-medium text-text-tertiary">
                        {signal}
                      </span>
                    ))}
                  </div>
                )}

                {opportunity.reasoning && (
                  <div className="mb-4 rounded-xl border border-black/[0.05] bg-black/[0.018]">
                    <button
                      type="button"
                      onClick={() => setExpandedId(current => current === opportunity.id ? null : opportunity.id)}
                      aria-expanded={expandedId === opportunity.id}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-[12px] font-semibold text-text-secondary"
                    >
                      Why this conversation matters
                      {expandedId === opportunity.id
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedId === opportunity.id && (
                      <p className="border-t border-black/[0.05] px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
                        {opportunity.reasoning}
                      </p>
                    )}
                  </div>
                )}

                {opportunity.automationReason && opportunity.automationReason !== 'confidence_cleared' && (
                  <div className="mb-4 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-[12px] leading-relaxed text-amber-800">
                    <span className="font-semibold">Review status: </span>
                    {AUTOMATION_REASON_LABELS[opportunity.automationReason] || 'This reply requires manual review.'}
                    {opportunity.qualityIssues.length > 0 && (
                      <span className="ml-1 text-amber-700">
                        Checks: {opportunity.qualityIssues.join(', ').replaceAll('_', ' ')}.
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-black/[0.04] pt-4">
                  <span className="text-[12px] font-medium text-text-tertiary">Matched: &quot;{opportunity.keyword}&quot;</span>
                  <div className="flex-1" />
                  {opportunity.url && (
                    <a
                      href={opportunity.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[13px] font-semibold text-text-secondary hover:text-text-primary"
                    >
                      View source <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {opportunity.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => handleDraftReply(opportunity.id)}
                      disabled={draftingId === opportunity.id}
                      className="btn-primary flex items-center gap-2 px-4 py-2 text-[13px] disabled:opacity-50 !rounded-full"
                    >
                      {draftingId === opportunity.id ? 'Drafting...' : 'Generate draft'}
                    </button>
                  ) : (
                    <Link href="/drafts" className="btn-primary flex items-center gap-2 px-4 py-2 text-[13px] !rounded-full">
                      {opportunity.status === 'drafted' ? 'Review draft' : 'Write reply'}
                    </Link>
                  )}
                </div>
              </motion.article>
            ))}
          </motion.div>
        )}
      </div>
    </AppPage>
  )
}
