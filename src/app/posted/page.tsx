'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, ExternalLink, Clock, MessageSquare } from 'lucide-react'
import { staggers, springs } from '@/lib/motion'
import { RedditIcon, BlueskyIcon } from '@/components/Icons'
import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/utils/supabase/client'

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="px-2.5 py-1 rounded-md bg-black/[0.04] text-text-secondary text-[12px] font-[500] capitalize flex items-center gap-1.5 w-fit shrink-0">
      {platform.toLowerCase() === 'reddit' ? <RedditIcon className="w-3.5 h-3.5 text-[#FF4500]" /> : <BlueskyIcon className="w-3.5 h-3.5 text-[#1185FE]" />}
      {platform}
    </span>
  )
}

function formatPostedDate(dateString: string) {
  const d = new Date(dateString)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PostedPage() {
  const [posted, setPosted] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function fetchPosted() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('monitored_threads')
        .select('*, reply_analytics(draft_text, sent_at)')
        .eq('user_id', user.id)
        .eq('status', 'replied')
        .order('created_at', { ascending: false })

      if (data) {
        setPosted(data.map(t => {
          const analytics = Array.isArray(t.reply_analytics) ? t.reply_analytics[0] : null
          return {
            id: t.id, 
            platform: t.platform, 
            target: t.author || 'unknown', 
            threadTitle: t.text_content ? t.text_content.slice(0, 80) + '...' : 'Unknown thread',
            sentAt: analytics?.sent_at ? formatPostedDate(analytics.sent_at) : formatPostedDate(t.created_at),
            reply: analytics?.draft_text || 'Reply logged.',
            threadUrl: t.url || null,
            score: Number(t.intent_score) || 0
          }
        }))
      }
    }
    fetchPosted()
  }, [])

  return (
    <AppPage>
      <div className="w-full flex flex-col">
        <PageHeader title="Posted Replies" subtitle="History of approved replies sent to Reddit and Bluesky." />

      {posted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center surface-ceramic border border-transparent">
          <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mb-5">
            <CheckCircle className="w-8 h-8" strokeWidth={2.5} />
          </div>
          <h3 className="text-[20px] font-display font-semibold text-text-primary mb-2">No replies posted yet</h3>
          <p className="text-text-secondary text-[15px] max-w-sm leading-relaxed">Once you mark a draft as posted, it will appear here with a link back to the original thread.</p>
        </div>
      ) : (
        <motion.div variants={staggers.container} initial="initial" animate="animate" className="space-y-4">
          {posted.map(p => (
            <motion.div 
              key={p.id} 
              variants={staggers.item} 
              whileHover={{ y: -2, boxShadow: 'var(--shadow-elevation-2)' }} 
              transition={springs.smooth} 
              className="surface-ceramic p-6 border border-transparent transition-all duration-300 hover:shadow-elevation-2"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <PlatformBadge platform={p.platform} />
                  <span className="text-[14px] font-semibold text-text-primary">{p.platform === 'reddit' ? `r/${p.target}` : p.target}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary whitespace-nowrap shrink-0">
                  <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />{p.sentAt}
                </div>
              </div>

              {/* Thread title */}
              <div className="flex items-center justify-between gap-4 mb-3">
                <h3 className="text-[16px] font-semibold text-text-primary line-clamp-1 flex-1 tracking-tight">{p.threadTitle}</h3>
                {p.threadUrl ? (
                  <a href={p.threadUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:opacity-80 transition-opacity shrink-0 bg-accent/5 p-2 rounded-full">
                    <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
                  </a>
                ) : (
                  <span className="text-text-tertiary/40 shrink-0 bg-black/[0.03] p-2 rounded-full" title="No thread URL available">
                    <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
                  </span>
                )}
              </div>

              {/* Reply preview */}
              <div className="p-4 rounded-[16px] bg-surface-secondary border border-transparent mb-5">
                <div className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" strokeWidth={2.5} /> Your reply
                </div>
                <p className="text-[15px] text-text-primary leading-relaxed line-clamp-3">{p.reply}</p>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-success">
                  <CheckCircle className="w-4 h-4" strokeWidth={3} /> Posted
                </span>
                <span className="opacity-30">·</span>
                <span className="text-[13px] text-text-tertiary font-medium tabular-nums">Intent score: {p.score}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
      </div>
    </AppPage>
  )
}
