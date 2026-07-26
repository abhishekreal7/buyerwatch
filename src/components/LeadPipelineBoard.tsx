'use client'

import { useState } from 'react'
import {
  ArrowUpDown,
  AtSign,
  Calendar,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Sparkles,
  Zap,
} from 'lucide-react'
import { BlueskyIcon, RedditIcon } from '@/components/Icons'
import { type IntentLabel } from '@/lib/intent'

export type OpportunityStatus = 'pending' | 'drafted' | 'needs_manual_reply' | 'posted'

export type PipelineOpportunity = {
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

function formatShortDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
}

function PlatformIcon({ platform }: { platform: string }) {
  const norm = platform.toLowerCase()
  if (norm === 'reddit') return <RedditIcon className="h-3.5 w-3.5 text-[#FF4500]" />
  if (norm === 'bluesky') return <BlueskyIcon className="h-3.5 w-3.5 text-[#0284C7]" />
  if (norm === 'x') return <AtSign className="h-3.5 w-3.5 text-[#0F1419]" />
  return <MessageCircle className="h-3.5 w-3.5 text-gray-500" />
}

export function LeadPipelineBoard({
  opportunities,
  onDraftReply,
  draftingId,
}: {
  opportunities: PipelineOpportunity[]
  onDraftReply: (id: string) => void
  draftingId: string | null
}) {
  const [selectedId, setSelectedId] = useState<string | null>(opportunities[0]?.id ?? null)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  // Pipeline columns definition
  const columns = [
    {
      id: 'discovered',
      title: 'Discovered',
      statusCheck: (o: PipelineOpportunity) => o.status === 'pending' && !o.flag,
    },
    {
      id: 'draft_ready',
      title: 'Draft Ready',
      statusCheck: (o: PipelineOpportunity) => o.status === 'drafted',
    },
    {
      id: 'action_needed',
      title: 'Review Needed',
      statusCheck: (o: PipelineOpportunity) => o.status === 'needs_manual_reply' || Boolean(o.flag),
    },
    {
      id: 'posted',
      title: 'Posted / Closed',
      statusCheck: (o: PipelineOpportunity) => o.status === 'posted',
    },
  ]

  return (
    <div className="w-full no-scrollbar overflow-x-auto pb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 min-w-[900px] xl:min-w-0">
        {columns.map((col) => {
          const colItems = opportunities
            .filter(col.statusCheck)
            .sort((a, b) => (sortOrder === 'desc' ? b.score - a.score : a.score - b.score))

          return (
            <div key={col.id} className="flex flex-col rounded-2xl bg-[#F6F6F4]/70 p-3 border border-[#ECECE9]">
              {/* Column Header matching screenshot */}
              <div className="flex items-center justify-between px-1 mb-3">
                <h3 className="text-[15px] font-bold text-[#1C1C1A] tracking-tight">{col.title}</h3>
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg bg-white border border-[#E3E3DF] px-2 text-[12px] font-bold text-[#3A3A36] shadow-2xs">
                    {colItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSortOrder((curr) => (curr === 'desc' ? 'asc' : 'desc'))}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-[#7A7A75] hover:bg-white hover:text-black transition-colors"
                    title="Sort by intent score"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Cards Container */}
              <div className="flex flex-col gap-3 min-h-[360px]">
                {colItems.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[#E3E3DF] p-6 text-center">
                    <p className="text-[12px] font-medium text-[#94948E]">No leads in {col.title.toLowerCase()}</p>
                  </div>
                ) : (
                  colItems.map((item) => {
                    const isSelected = selectedId === item.id

                    if (isSelected) {
                      {/* Selected Dark Card matching reference image */}
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className="group relative cursor-pointer rounded-2xl bg-[#18181B] p-4 text-white shadow-xl ring-1 ring-black/20 transition-all duration-200"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <PlatformIcon platform={item.platform} />
                              <span className="text-[11px] font-medium text-gray-300 capitalize">{item.target}</span>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-400">
                              <Zap className="h-3 w-3" />
                              {item.score}%
                            </span>
                          </div>

                          <h4 className="text-[14.5px] font-semibold text-white leading-snug line-clamp-2 mb-1.5">
                            {item.title || 'Conversation Lead'}
                          </h4>

                          <p className="text-[12px] text-gray-300 line-clamp-3 leading-relaxed mb-3">
                            {item.content}
                          </p>

                          <div className="space-y-1.5 border-t border-white/10 pt-2.5 text-[11.5px] text-gray-300">
                            <div className="flex items-center gap-2 text-gray-300">
                              <span className="truncate font-medium text-gray-200">r/{item.target} • {item.author}</span>
                            </div>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline truncate"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                View thread source
                              </a>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-white/10 mt-3">
                            <div className="flex items-center gap-1 text-[11px] text-gray-400">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{formatShortDate(item.createdAt)}</span>
                            </div>

                            {item.status === 'pending' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onDraftReply(item.id)
                                }}
                                disabled={draftingId === item.id}
                                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm disabled:opacity-50"
                              >
                                <Sparkles className="h-3 w-3" />
                                {draftingId === item.id ? 'Drafting…' : 'Generate reply'}
                              </button>
                            )}

                            {item.status === 'drafted' && (
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3" /> Ready
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    }

                    {/* Standard White Card matching reference image */}
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className="group relative cursor-pointer rounded-2xl bg-white p-4 border border-[#E4E4E1] shadow-2xs hover:shadow-md hover:border-[#D4D4D0] transition-all duration-150"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h4 className="text-[14px] font-bold text-[#1C1C1A] leading-snug line-clamp-1 group-hover:text-blue-600 transition-colors">
                            {item.title || item.keyword}
                          </h4>
                          <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-bold text-gray-700">
                            {item.score}
                          </span>
                        </div>

                        <p className="text-[12px] text-[#63635E] line-clamp-2 leading-relaxed mb-3">
                          {item.content || item.reasoning}
                        </p>

                        <div className="flex items-center justify-between text-[11px] text-[#8C8C85] border-t border-[#F0F0ED] pt-2.5">
                          <div className="flex items-center gap-1.5 rounded-md bg-[#F5F5F3] px-2 py-0.5">
                            <Calendar className="h-3 w-3 text-[#70706B]" />
                            <span className="font-medium text-[#4A4A45]">{formatShortDate(item.createdAt)}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <PlatformIcon platform={item.platform} />
                            <span className="font-medium text-[#4A4A45]">{item.author}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
