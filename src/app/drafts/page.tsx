'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Edit3, Copy, Check, CheckCircle, X, RefreshCcw, ExternalLink } from 'lucide-react'
import { springs, staggers } from '@/lib/motion'
import { RedditIcon, BlueskyIcon } from '@/components/Icons'
import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { getIntentDisplayLabel, type IntentLabel } from '@/lib/intent'
import { evaluateReplyQuality } from '@/lib/reply-quality'

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const isHigh = score >= 80
  const isMid = score >= 60 && score < 80

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold ${
      isHigh ? 'bg-success/10 text-success border border-success/20' : 
      isMid ? 'bg-accent/10 text-accent border border-accent/20' : 
      'bg-black/[0.05] text-black/60 border border-black/[0.08]'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isHigh ? 'bg-success' : isMid ? 'bg-accent' : 'bg-black/35'}`} />
      <span className="tabular-nums">{score}</span> · {label}
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

export default function DraftsPage() {
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
  const [connections, setConnections] = useState<string[]>([])
  const [businessName, setBusinessName] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function fetchDrafts() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data: conns } = await supabase.from('platform_connections').select('platform').eq('user_id', user.id)
      if (conns) setConnections(conns.map(c => c.platform))
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_name')
        .eq('id', user.id)
        .single()
      setBusinessName(profile?.business_name || '')

      const { data } = await supabase
        .from('monitored_threads')
        .select('*, reply_analytics(draft_text), keywords(term, target)')
        .eq('user_id', user.id)
        .in('status', ['drafted', 'needs_manual_reply'])
        .order('created_at', { ascending: false })

      if (data && data.length > 0) {
        const parsed = data.map(t => {
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
        setDrafts(parsed)
        setSelected(parsed[0])
        setDraftContent(parsed[0].draft)
      }
    }
    fetchDrafts()
  }, [])

  const handleSelect = (d: any) => {
    setSelected(d)
    setDraftContent(d.draft)
    // Capture the original AI draft at selection time — this is the baseline
    // for edit-distance comparison in handleApproveAndSend.
    originalDraftRef.current = d.draft
    setCopied(false)
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
    const quality = evaluateReplyQuality(draftContent, {
      businessName,
      platform: selected.platform,
    })
    if (quality.blocksAutomation) {
      toast.error(quality.issues[0]?.message || 'Resolve the publishing checks before posting.')
      return
    }
    if (!connections.includes(selected.platform)) {
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
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.issues?.[0]?.message || payload?.error || 'Failed to queue reply')
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
        toast.warning('Reply queued, but review history could not be updated.')
      }

      setDrafts(prev => prev.filter(d => d.id !== threadIdToSend))
      const nextSelected = drafts.find(d => d.id !== threadIdToSend) || null
      setSelected(nextSelected)
      setDraftContent(nextSelected?.draft || '')
      originalDraftRef.current = nextSelected?.draft || ''
      toast.success('Reply queued for posting')
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
    supabase.from('monitored_threads').update({ status: 'dismissed' }).eq('id', threadIdToDismiss).then()
    setDrafts(prev => prev.filter(d => d.id !== threadIdToDismiss))
    const nextSelected = drafts.find(d => d.id !== threadIdToDismiss) || null
    setSelected(nextSelected)
    if (nextSelected) setDraftContent(nextSelected.draft)
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

  return (
    <AppPage>
      <div className="flex flex-col h-[calc(100vh-144px)] overflow-hidden w-full">
        <PageHeader title="Drafts Ready" subtitle="AI-drafted replies ready for your review and approval before posting." />

      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0 overflow-hidden">
        {/* Draft list */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="pb-4 shrink-0 px-1">
            <p className="text-[14px] font-medium text-text-secondary"><span className="tabular-nums font-bold text-text-primary">{drafts.length}</span> drafts awaiting review</p>
          </div>
          <motion.div variants={staggers.container} initial="initial" animate="animate" className="flex-1 overflow-y-auto space-y-4 px-1 pb-4">
            {drafts.map(d => (
              <motion.div
                key={d.id}
                variants={staggers.item}
                onClick={() => handleSelect(d)}
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
                <div className="flex items-center justify-between pt-4 border-t border-black/[0.04]">
                  <ScoreBadge score={d.score} label={d.label} />
                  <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-accent">
                    <Edit3 className="w-3.5 h-3.5" strokeWidth={2.5} /> Draft ready
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Reply Panel - Elevated Layer */}
        {selected && (
          <div className="w-full lg:w-[500px] xl:w-[600px] flex flex-col shrink-0 min-h-0 bg-surface shadow-elevation-3 border border-transparent rounded-[24px] overflow-hidden">
            <div className="px-6 py-5 border-b border-black/[0.06] flex justify-between items-center bg-surface shrink-0">
              <h3 className="font-semibold text-text-primary text-[16px]">Review & Post</h3>
              {selected.url ? (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:opacity-80 text-[14px] font-semibold flex items-center gap-1.5 transition-opacity"
                >
                  Open Thread <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
                </a>
              ) : (
                <span className="text-[14px] font-medium text-text-tertiary flex items-center gap-1.5">
                  Open Thread <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-surface">
              {/* Original Post context */}
              <div className="p-5 rounded-[16px] bg-background border border-black/[0.04]">
                <div className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-2.5">Original Post Preview</div>
                {selected.title && <h4 className="text-[15px] font-semibold text-text-primary mb-2">{selected.title}</h4>}
                <p className="text-text-secondary text-[14px] leading-relaxed">{selected.content}</p>
              </div>

              {/* AI Draft */}
              <div>
                <div className="flex justify-between items-end mb-3">
                  <div className="text-[12px] font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4" strokeWidth={2.5} /> AI Draft Reply
                  </div>
                  <span className="text-[12px] font-medium text-text-tertiary">{draftContent.length} chars</span>
                </div>
                <textarea
                  value={draftContent}
                  onChange={e => setDraftContent(e.target.value)}
                  className="w-full h-[280px] bg-surface-secondary border border-transparent rounded-[16px] p-5 text-text-primary placeholder-text-tertiary focus:outline-none focus:bg-surface-secondary focus:ring-4 focus:ring-accent/20 focus:shadow-elevation-1 transition-all duration-300 resize-none leading-relaxed text-[15px]"
                />
              </div>

              <div>
                <div className="text-[13px] font-semibold text-text-primary mb-4">Publishing checks</div>
                {currentQuality?.blocksAutomation ? (
                  <ul className="space-y-3 text-[13px] font-medium text-amber-800">
                    {currentQuality.issues.map(issue => (
                      <li key={issue.code} className="flex min-w-0 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                        <AlertTriangle className="mt-0.5 h-[17px] w-[17px] shrink-0 text-amber-600" />
                        <span className="min-w-0 break-words">{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-3 text-[14px] text-text-secondary font-medium">
                    <li className="flex items-start gap-3 min-w-0"><Check className="w-[18px] h-[18px] text-success mt-0.5 shrink-0" strokeWidth={3} /><span className="break-words min-w-0">No deterministic promotional or call-to-action language detected</span></li>
                    <li className="flex items-start gap-3 min-w-0"><Check className="w-[18px] h-[18px] text-success mt-0.5 shrink-0" strokeWidth={3} /><span className="break-words min-w-0">Commercial references include an affiliation disclosure</span></li>
                    <li className="flex items-start gap-3 min-w-0"><Check className="w-[18px] h-[18px] text-success mt-0.5 shrink-0" strokeWidth={3} /><span className="break-words min-w-0">Platform length limit is satisfied; final relevance remains your decision</span></li>
                  </ul>
                )}
              </div>
            </div>

            {/* Action Footer */}
            <div className="p-5 border-t border-black/[0.06] bg-surface shrink-0 flex gap-3">
              {/* Dismiss */}
              <button onClick={handleDismiss} className="btn-icon bg-background border border-black/[0.04]" title="Dismiss">
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
              {/* Regenerate */}
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating || isSending}
                className="btn-icon bg-background border border-black/[0.04] disabled:opacity-40"
                title="Regenerate Draft"
              >
                <RefreshCcw className={`w-5 h-5 ${isRegenerating ? 'animate-spin' : ''}`} strokeWidth={2} />
              </button>
              <div className="flex-1" />
              {/* Copy */}
              <button onClick={handleCopy} className="btn-secondary !rounded-[12px] px-4 hidden sm:flex items-center gap-2">
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              {/* Approve & Post */}
              <button 
                onClick={handleApproveAndSend}
                disabled={isSending || currentQuality?.blocksAutomation}
                className="btn-primary !rounded-[12px] px-6 flex items-center gap-2 flex-1 sm:flex-none justify-center"
              >
                {isSending ? (
                  <span className="flex items-center gap-2">
                    <RefreshCcw className="w-4 h-4 animate-spin" /> Sending...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" strokeWidth={2.5} /> Approve & Post
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </AppPage>
  )
}
