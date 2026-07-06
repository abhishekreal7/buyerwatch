'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Target, Filter, MessageCircle, ExternalLink, Zap } from 'lucide-react'
import { springs, staggers } from '@/lib/motion'
import { RedditIcon, BlueskyIcon } from '@/components/Icons'
import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/utils/supabase/client'

const FILTERS = ['All', 'Buying Intent', 'Researching', 'Reddit', 'Bluesky']

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const isHigh = score >= 80
  const isMid = score >= 60 && score < 80
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold ${
      isHigh ? 'bg-success/10 text-success border border-success/20' : 
      isMid ? 'bg-[#FF9F0A]/10 text-[#FF9F0A] border border-[#FF9F0A]/20' : 
      'bg-accent/10 text-accent border border-accent/20'
    }`}>
      {isHigh ? '🟢' : isMid ? '🟡' : '🔵'} <span className="tabular-nums">{score}</span> · {label}
    </div>
  )
}

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

export default function OpportunitiesPage() {
  const [activeFilter, setActiveFilter] = useState('All')
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchOpportunities() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('monitored_threads')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (data) {
        setOpportunities(data.map(t => ({
          id: t.id, platform: t.platform, target: t.author || 'unknown', timeAgo: formatTimeAgo(t.created_at),
          title: '', content: t.text_content, score: Number(t.intent_score) || 0, label: Number(t.intent_score) >= 80 ? 'Buying' : 'Researching', 
          keyword: t.keyword_id || '', comments: 0, upvotes: 0
        })))
      }
    }
    fetchOpportunities()
  }, [])

  const handleDraftReply = async (id: string) => {
    if (draftingId) return
    setDraftingId(id)
    try {
      const res = await fetch('/api/replies/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: id })
      })
      if (!res.ok) throw new Error('Failed to generate draft')
      
      // Remove from list since it is now drafted (moved to drafts/dashboard)
      setOpportunities(prev => prev.filter(o => o.id !== id))
    } catch (err) {
      console.error(err)
    } finally {
      setDraftingId(null)
    }
  }

  const filtered = opportunities.filter(o => {
    if (activeFilter === 'All') return true
    if (activeFilter === 'Buying Intent') return o.label === 'Buying'
    if (activeFilter === 'Researching') return o.label === 'Researching'
    if (activeFilter === 'Reddit') return o.platform === 'reddit'
    if (activeFilter === 'Bluesky') return o.platform === 'bluesky'
    return true
  })

  return (
    <AppPage>
      <div className="w-full flex flex-col">
        <PageHeader
          title="Opportunities"
          subtitle="High-intent threads found by your keywords — review and draft a reply."
          action={
            opportunities.length > 0 ? (
              <div className="flex items-center gap-2 text-[12px] font-medium text-white bg-gray-900 px-3 py-1 rounded-full shadow-sm ring-1 ring-black/5">
                <div className="relative flex items-center justify-center w-2 h-2">
                  <div className="absolute inset-0 rounded-full bg-[#0A84FF] animate-ping opacity-40" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#0A84FF]" />
                </div>
                <span>{opportunities.length} new threads</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
                <span>All caught up</span>
              </div>
            )
          }
        />

      {/* Filter bar */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto no-scrollbar pb-1 px-1">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`!rounded-full whitespace-nowrap ${
              activeFilter === f
                ? 'btn-primary'
                : 'btn-secondary text-text-secondary hover:text-text-primary border-none shadow-[inset_0_1px_0_rgba(255,255,255,1),0_1px_2px_rgba(0,0,0,0.02)] bg-white'
            }`}
          >
            {f}
          </button>
        ))}
        <button className="ml-auto flex items-center gap-2 !rounded-full btn-secondary text-text-primary bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,1),0_1px_2px_rgba(0,0,0,0.02)] whitespace-nowrap">
          <Filter className="w-4 h-4" strokeWidth={2} /> Sort
        </button>
      </div>

      {/* Thread list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center surface-ceramic border border-transparent">
          <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-5">
            <Target className="w-8 h-8" strokeWidth={2.5} />
          </div>
          <h3 className="text-[20px] font-display font-semibold text-text-primary mb-2">No opportunities here</h3>
          <p className="text-text-secondary text-[15px] max-w-sm leading-relaxed">Your keywords are monitoring Reddit and Bluesky. New opportunities will appear as they&apos;re found.</p>
        </div>
      ) : (
        <motion.div variants={staggers.container} initial="initial" animate="animate" className="space-y-4 px-1 pb-4">
          {filtered.map(op => (
            <motion.div 
              key={op.id} 
              variants={staggers.item} 
              whileHover={{ y: -2, boxShadow: 'var(--shadow-elevation-2)' }} 
              transition={springs.smooth} 
              className="surface-ceramic p-6 border border-transparent cursor-pointer transition-all duration-300 hover:shadow-elevation-2"
            >
              {/* Meta row */}
              <div className="flex items-center gap-2.5 mb-4 text-[13px] text-text-secondary flex-wrap">
                <PlatformBadge platform={op.platform} />
                <span className="font-semibold text-text-primary">{op.platform === 'reddit' ? `r/${op.target}` : `"${op.target}"`}</span>
                <span className="opacity-50">·</span>
                <span className="font-medium">{op.timeAgo}</span>
                <div className="flex-1" />
                <ScoreBadge score={op.score} label={op.label} />
              </div>

              {/* Title + content */}
              {op.title && <h3 className="text-[17px] font-semibold text-text-primary mb-2.5 leading-snug tracking-tight">{op.title}</h3>}
              <p className="text-text-secondary text-[15px] line-clamp-2 mb-5 leading-relaxed">{op.content}</p>

              {/* Footer */}
              <div className="flex items-center gap-4 pt-4 border-t border-black/[0.04]">
                <span className="text-[13px] text-text-tertiary font-medium">Matched: &quot;{op.keyword}&quot;</span>
                <div className="flex-1" />
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text-tertiary tabular-nums"><MessageCircle className="w-4 h-4" strokeWidth={2} />{op.comments}</span>
                <span className="text-[13px] font-semibold text-text-tertiary tabular-nums">↑ {op.upvotes}</span>
                <button 
                  onClick={() => handleDraftReply(op.id)}
                  disabled={draftingId === op.id}
                  className="btn-primary text-[13px] px-4 py-2 !rounded-full flex items-center gap-2 ml-2 disabled:opacity-50"
                >
                  {draftingId === op.id ? 'Drafting...' : 'Draft Reply'} <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
        )}
      </div>
    </AppPage>
  )
}
