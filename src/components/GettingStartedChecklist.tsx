'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, X, Sparkles, ArrowRight, Compass } from 'lucide-react'
import Link from 'next/link'

interface GettingStartedChecklistProps {
  keywordsCount: number
  hasInspectedLead: boolean
  hasCopiedOrApproved: boolean
  autoSendEnabled: boolean
}

export function GettingStartedChecklist({
  keywordsCount,
  hasInspectedLead,
  hasCopiedOrApproved,
  autoSendEnabled,
}: GettingStartedChecklistProps) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const steps = [
    {
      id: 'keyword',
      title: 'Monitoring Active',
      desc: 'At least one rule is checking conversations',
      done: keywordsCount > 0,
      link: '/keywords',
      actionLabel: 'Add keyword',
    },
    {
      id: 'inspect',
      title: 'First Match Reviewed',
      desc: 'Review lead context and intent signals',
      done: hasInspectedLead,
      link: '/dashboard#opportunities',
      actionLabel: 'Review',
    },
    {
      id: 'reply',
      title: 'First Reply Prepared',
      desc: 'Copy or approve a generated draft',
      done: hasCopiedOrApproved,
      link: '/drafts',
      actionLabel: 'Drafts',
    },
    {
      id: 'autosend',
      title: 'Delivery Controls Ready',
      desc: 'Configure auto-delivery rules and channels',
      done: autoSendEnabled,
      link: '/settings?section=connections',
      actionLabel: 'Settings',
    },
  ]

  const completedCount = steps.filter(s => s.done).length
  const totalSteps = steps.length
  const isAllComplete = completedCount === totalSteps
  const percent = Math.round((completedCount / totalSteps) * 100)

  // Find next pending action
  const nextPendingStep = steps.find(s => !s.done)

  useEffect(() => {
    const savedDismissed = localStorage.getItem('buyerwatch_checklist_dismissed') === 'true'
    if (savedDismissed) setDismissed(true)
  }, [])

  // Auto-dismiss once 100% complete
  useEffect(() => {
    if (isAllComplete) {
      const timer = setTimeout(() => {
        localStorage.setItem('buyerwatch_checklist_dismissed', 'true')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [isAllComplete])

  // Close on outside click or Escape key
  useEffect(() => {
    if (!visible) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setVisible(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [visible])

  // Auto popup on progress milestone with pause-on-hover
  const prevCountRef = useRef<number>(completedCount)
  useEffect(() => {
    if (completedCount > prevCountRef.current && prevCountRef.current !== 0) {
      setVisible(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setVisible(false)
      }, 5500)
    }
    prevCountRef.current = completedCount
  }, [completedCount])

  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  if (dismissed) return null

  return (
    <div ref={containerRef} className="relative z-40">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setVisible(prev => !prev)}
        className="group flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-xl border border-[#E3E3E0] bg-white px-3 py-1.5 text-xs font-semibold text-[#4F5865] shadow-xs transition-all hover:border-[#D0D5DD] hover:bg-[#FAFAFA] hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] sm:min-h-0"
        aria-expanded={visible}
        aria-controls="setup-progress-panel"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-bold text-emerald-700 border border-emerald-200/80">
          {completedCount}
        </div>
        <span className="tracking-[-0.01em]">Activation {completedCount}/{totalSteps}</span>
      </button>

      {/* Pop-Up Panel */}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            id="setup-progress-panel"
            onMouseEnter={handleMouseEnter}
            className="fixed inset-x-3 top-[120px] z-[60] overflow-hidden rounded-2xl border border-black/10 bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.14)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[340px]"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <Compass className="h-4 w-4 stroke-[2.2]" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      Activation Progress
                    </span>
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.2 text-[10px] font-bold text-gray-700">
                      {completedCount}/{totalSteps}
                    </span>
                  </div>
                  <h4 className="mt-0.5 text-[12.5px] font-semibold text-gray-900 tracking-tight">
                    {isAllComplete
                      ? 'Workflow fully activated'
                      : nextPendingStep
                        ? `Next: ${nextPendingStep.title}`
                        : 'First-result progress'}
                  </h4>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setVisible(false)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                aria-label="Close activation checklist"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* Checklist Items */}
            <div className="space-y-1.5 border-t border-gray-100 pt-2.5">
              {steps.map((s, idx) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors ${
                    s.done
                      ? 'bg-emerald-50/40 border border-emerald-100/80 text-emerald-950'
                      : 'bg-gray-50/70 border border-gray-100 text-gray-700 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {s.done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 stroke-[2.2]" />
                    ) : (
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-400">
                        {idx + 1}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className={`truncate text-[12px] ${s.done ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                        {s.title}
                      </p>
                      <p className="truncate text-[10.5px] text-gray-500">
                        {s.desc}
                      </p>
                    </div>
                  </div>

                  {!s.done && s.link && (
                    <Link
                      href={s.link}
                      onClick={() => setVisible(false)}
                      className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-gray-800 border border-gray-200 shadow-2xs transition-colors hover:bg-gray-50 hover:text-black"
                    >
                      {s.actionLabel} <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  )}
                </div>
              ))}
            </div>

            {/* Completion Status */}
            {isAllComplete && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 p-2.5 text-xs font-semibold text-white shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-emerald-200" /> Core workflow fully verified
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
