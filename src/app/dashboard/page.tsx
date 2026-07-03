'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Target, CheckCircle, RefreshCcw, ExternalLink, MessageCircle, Copy, Check, X, Search, Edit3 } from 'lucide-react'

// Mock Data
const MOCK_STATS = {
  threadsFound: { value: 142, trend: '+12' },
  highIntent: { value: 24, text: 'Ready to engage' },
  draftsReady: { value: 5, text: 'Review Now →' },
  postedToday: { value: 8, text: 'Approved replies' },
}

const MOCK_THREADS = [
  {
    id: 't1',
    platform: 'reddit',
    target: 'entrepreneur',
    timeAgo: '23 minutes ago',
    title: 'Looking for Mailchimp alternative that is cheaper and has better automation...',
    content: "I've been using Mailchimp for 2 years but their pricing is getting ridiculous as my list grows. Also their automation builder feels clunky. Has anyone moved to something better for a SaaS business?",
    score: 94,
    label: 'Buying',
    matchedKeyword: 'mailchimp alternative',
    comments: 12,
    upvotes: 45,
    draft: "Went through the exact same thing last year. Mailchimp's pricing model really punishes growth.\n\nWe moved to a different setup and the automations are much smoother. That alone saved us significant time each week.\n\nWe actually ended up building Scouto specifically to solve the Reddit marketing side of this — might be worth a look if you want to grow your audience too. Happy to answer questions about how we approached the email migration.\n\n(disclaimer: I'm the founder of Scouto)"
  },
  {
    id: 't2',
    platform: 'bluesky',
    target: 'customer acquisition',
    timeAgo: '2 hours ago',
    title: '',
    content: "Facebook ads are too expensive and SEO takes forever. What are some scrappy ways you are getting your first 100 customers?",
    score: 82,
    label: 'Buying',
    matchedKeyword: 'customer acquisition',
    comments: 34,
    upvotes: 112,
    draft: "Reddit has honestly been our best channel for early acquisition. People are literally telling you what they want.\n\nInstead of shouting into the void on Twitter, find threads where people are complaining about the exact problem you solve. Provide value first, then mention your tool.\n\nWe built Scouto (disclaimer: I'm the founder) to automate this monitoring process, but you can do it manually using Reddit search to start. Highly recommend trying it out."
  },
  {
    id: 't3',
    platform: 'reddit',
    target: 'marketing',
    timeAgo: '5 hours ago',
    title: 'Is anyone actually getting ROI from Reddit ads?',
    content: "We tried running some Reddit ads last month and the CPC was okay but conversions were zero. Are we doing it wrong or do Reddit users just hate ads?",
    score: 65,
    label: 'Researching',
    matchedKeyword: 'reddit ads',
    comments: 8,
    upvotes: 15,
    draft: "Reddit users generally despise traditional ads. The platform is built on community and authenticity.\n\nWe found that organic engagement (replying to people who actually have the problem you solve) converts at a much higher rate than paid ads ever did. It takes more work, but the trust factor is built in.\n\n(disclaimer: I built Scouto to help businesses monitor Reddit organically for this exact reason)"
  }
]

export default function DashboardPage() {
  const [selectedThread, setSelectedThread] = useState(MOCK_THREADS[0])
  const [draftContent, setDraftContent] = useState(MOCK_THREADS[0].draft)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(draftContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8 shrink-0">
        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.05}} className="glass rounded-2xl p-5 border border-border">
          <div className="flex items-center gap-3 text-text-secondary mb-3 text-sm font-medium">
            <Search className="w-4 h-4" /> Threads Found
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-display font-bold text-text-primary">{MOCK_STATS.threadsFound.value}</span>
            <span className="text-sm font-medium text-[#30D158]">{MOCK_STATS.threadsFound.trend} today</span>
          </div>
        </motion.div>
        
        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.1}} className="glass rounded-2xl p-5 border border-border">
          <div className="flex items-center gap-3 text-text-secondary mb-3 text-sm font-medium">
            <Target className="w-4 h-4 text-[#30D158]" /> High Intent
          </div>
          <div className="flex items-baseline gap-3 flex-col sm:flex-row">
            <span className="text-3xl font-display font-bold text-text-primary">{MOCK_STATS.highIntent.value}</span>
            <span className="text-sm text-text-secondary">{MOCK_STATS.highIntent.text}</span>
          </div>
        </motion.div>

        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.15}} className="glass rounded-2xl p-5 border border-[#0A84FF]/30 relative overflow-hidden group cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A84FF]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex items-center gap-3 text-text-secondary mb-3 text-sm font-medium relative z-10">
            <Edit3 className="w-4 h-4 text-[#0A84FF]" /> Drafts Ready
          </div>
          <div className="flex items-baseline justify-between relative z-10">
            <span className="text-3xl font-display font-bold text-text-primary">{MOCK_STATS.draftsReady.value}</span>
            <span className="text-sm font-medium text-[#0A84FF]">{MOCK_STATS.draftsReady.text}</span>
          </div>
        </motion.div>

        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.2}} className="glass rounded-2xl p-5 border border-border">
          <div className="flex items-center gap-3 text-text-secondary mb-3 text-sm font-medium">
            <CheckCircle className="w-4 h-4 text-text-secondary" /> Posted Today
          </div>
          <div className="flex items-baseline gap-3 flex-col sm:flex-row">
            <span className="text-3xl font-display font-bold text-text-primary">{MOCK_STATS.postedToday.value}</span>
            <span className="text-sm text-text-secondary">{MOCK_STATS.postedToday.text}</span>
          </div>
        </motion.div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0 overflow-hidden">
        {/* Thread Feed */}
        <div className="flex-1 flex flex-col min-h-0 border border-border rounded-2xl bg-surface/30">
          <div className="p-4 border-b border-border flex gap-2 overflow-x-auto no-scrollbar shrink-0">
            <button className="px-4 py-1.5 rounded-full bg-black/5 text-text-primary text-sm font-medium whitespace-nowrap">All Drafts</button>
            <button className="px-4 py-1.5 rounded-full text-text-secondary hover:bg-black/5 hover:text-text-primary transition-colors text-sm font-medium whitespace-nowrap">Buying Intent</button>
            <button className="px-4 py-1.5 rounded-full text-text-secondary hover:bg-black/5 hover:text-text-primary transition-colors text-sm font-medium whitespace-nowrap">Researching</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {MOCK_THREADS.map((thread) => (
              <div 
                key={thread.id} 
                onClick={() => { setSelectedThread(thread); setDraftContent(thread.draft); }}
                className={`glass rounded-2xl p-5 cursor-pointer transition-all duration-200 ${selectedThread.id === thread.id ? 'border-[#0A84FF] shadow-[0_0_15px_rgba(10,132,255,0.15)] bg-black/5' : 'hover:bg-black/5 border-border'}`}
              >
                <div className="flex items-center gap-2 mb-3 text-sm text-text-secondary">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
                    thread.platform === 'reddit' ? 'bg-[#FF453A]/20 text-[#FF453A]' : 'bg-[#0A84FF]/20 text-[#0A84FF]'
                  }`}>
                    {thread.platform}
                  </span>
                  <span className="font-medium text-text-primary">
                    {thread.platform === 'reddit' ? `r/${thread.target}` : `"${thread.target}"`}
                  </span>
                  <span>·</span>
                  <span>{thread.timeAgo}</span>
                </div>
                
                {thread.title && <h3 className="text-base font-semibold text-text-primary mb-2 leading-snug">{thread.title}</h3>}
                <p className="text-text-secondary text-sm line-clamp-2 mb-4 leading-relaxed">{thread.content}</p>
                
                <div className="flex items-center flex-wrap gap-3 mt-4 pt-4 border-t border-border">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    thread.score >= 80 ? 'bg-[#30D158]/20 text-[#30D158] border border-[#30D158]/30' : 'bg-[#0A84FF]/20 text-[#0A84FF] border border-[#0A84FF]/30'
                  }`}>
                    {thread.score >= 80 ? '🟢' : '🔵'} {thread.score} · {thread.label}
                  </div>
                  <span className="text-xs text-text-tertiary">Matched: "{thread.matchedKeyword}"</span>
                  <div className="flex-1"></div>
                  <div className="flex items-center gap-3 text-text-tertiary text-xs font-medium">
                    <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {thread.comments}</span>
                    <span className="flex items-center gap-1">↑ {thread.upvotes}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reply Panel */}
        <div className="w-full lg:w-[500px] xl:w-[600px] flex flex-col shrink-0 min-h-0 border border-border rounded-2xl bg-surface/50">
          <div className="p-5 border-b border-border flex justify-between items-center bg-surface-elevated/50 shrink-0">
            <h3 className="font-semibold text-text-primary">Review & Post</h3>
            <button className="text-[#0A84FF] hover:opacity-80 text-sm font-medium flex items-center gap-1.5 transition-opacity">
              Open Thread <ExternalLink className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Original Post context */}
            <div className="p-4 rounded-xl bg-black/5 border border-border">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Original Post Preview</div>
              <h4 className="text-sm font-medium text-text-primary mb-1">{selectedThread.title}</h4>
              <p className="text-text-secondary text-sm leading-relaxed">{selectedThread.content}</p>
            </div>

            {/* AI Draft */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div className="text-xs font-semibold text-[#0A84FF] uppercase tracking-wider flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" /> AI Draft Reply
                </div>
                <span className="text-xs text-text-tertiary">{draftContent.length} chars</span>
              </div>
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                className="w-full h-[280px] bg-surface-elevated border border-border rounded-xl p-4 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-[#0A84FF]/50 transition-colors resize-none leading-relaxed text-sm shadow-inner"
              />
            </div>

            {/* Why it works */}
            <div className="p-4 rounded-xl border border-border bg-gradient-to-br from-white/[0.03] to-transparent">
              <div className="text-xs font-semibold text-text-primary mb-3">Why this reply works:</div>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-[#30D158] mt-0.5 shrink-0" /> Leads with genuine value and shared experience</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-[#30D158] mt-0.5 shrink-0" /> Mentions product naturally in context</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-[#30D158] mt-0.5 shrink-0" /> Includes proper disclaimer for authenticity</li>
              </ul>
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-5 border-t border-border bg-surface-elevated/80 shrink-0 flex gap-3">
            <button className="p-3 text-text-secondary hover:text-text-primary bg-black/5 hover:bg-black/5 rounded-xl transition-colors border border-border" title="Dismiss">
              <X className="w-5 h-5" />
            </button>
            <button className="p-3 text-text-secondary hover:text-text-primary bg-black/5 hover:bg-black/5 rounded-xl transition-colors border border-border" title="Regenerate">
              <RefreshCcw className="w-5 h-5" />
            </button>
            
            <button 
              onClick={handleCopy}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all duration-200 border ${
                copied ? 'bg-[#30D158]/20 text-[#30D158] border-[#30D158]/30' : 'bg-black/5 text-text-primary border-border hover:bg-black/5'
              }`}
            >
              {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Draft</>}
            </button>
            
            <button className="flex-1 bg-[#0A84FF] text-text-primary py-3 rounded-xl font-medium transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(10,132,255,0.2)] flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Mark as Posted
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
