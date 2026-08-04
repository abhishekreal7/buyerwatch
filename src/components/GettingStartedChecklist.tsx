'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, X, Sparkles, ArrowRight, Trophy } from 'lucide-react'
import Link from 'next/link'

interface GettingStartedChecklistProps {
  extensionInstalled: boolean
  keywordsCount: number
  hasInspectedLead: boolean
  hasCopiedOrApproved: boolean
  autoSendEnabled: boolean
}

export function GettingStartedChecklist({
  extensionInstalled,
  keywordsCount,
  hasInspectedLead,
  hasCopiedOrApproved,
  autoSendEnabled,
}: GettingStartedChecklistProps) {
  const [visible, setVisible] = useState(false)
  const [justCompletedStep, setJustCompletedStep] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const steps = [
    {
      id: 'extension',
      title: 'Reddit Extension Installed',
      desc: 'Connect Chrome to BuyerWatch',
      done: extensionInstalled,
      link: '/settings?section=extension',
    },
    {
      id: 'keyword',
      title: 'Topic Monitored',
      desc: 'Set up at least 1 keyword',
      done: keywordsCount > 0,
      link: '/keywords',
    },
    {
      id: 'inspect',
      title: 'First Lead Inspected',
      desc: 'Clicked a thread to view intent details',
      done: hasInspectedLead,
    },
    {
      id: 'reply',
      title: 'Reply Copied / Approved',
      desc: 'Copied or approved an AI draft',
      done: hasCopiedOrApproved,
    },
    {
      id: 'autosend',
      title: 'Auto-send Enabled',
      desc: 'Toggled Auto-send in topbar',
      done: autoSendEnabled,
    },
  ]

  const completedCount = steps.filter(s => s.done).length
  const prevCompletedRef = useRef<number>(0)
  const isAllComplete = completedCount === steps.length

  useEffect(() => {
    const savedDismissed = localStorage.getItem('buyerwatch_checklist_dismissed') === 'true'
    if (savedDismissed) setDismissed(true)
  }, [])

  // Permanently hide & dismiss once 100% complete
  useEffect(() => {
    if (isAllComplete) {
      localStorage.setItem('buyerwatch_checklist_dismissed', 'true')
    }
  }, [isAllComplete])

  // Trigger smooth pop-up whenever a new step is completed!
  useEffect(() => {
    const previousCount = prevCompletedRef.current
    prevCompletedRef.current = completedCount

    if (completedCount > previousCount && previousCount !== 0) {
      const newlyDone = steps.filter(s => s.done)[completedCount - 1]
      setJustCompletedStep(newlyDone?.title || 'Setup Step Completed!')
      setVisible(true)

      // Auto-hide popup after 4.5 seconds
      const timer = setTimeout(() => {
        setVisible(false)
      }, 4500)
      return () => clearTimeout(timer)
    }
  }, [completedCount, extensionInstalled, keywordsCount, hasInspectedLead, hasCopiedOrApproved, autoSendEnabled])

  if (dismissed) return null

  return (
    <div className="relative z-40">
      <button
        onClick={() => setVisible(prev => !prev)}
        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#E3E3E0] bg-white px-3 py-2 text-xs font-semibold text-[#4F5865] shadow-xs transition-colors hover:bg-[#F7F7F5] hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] sm:min-h-0"
        aria-expanded={visible}
        aria-controls="setup-progress-panel"
      >
        <div className="w-5 h-5 rounded-full bg-blue-50 text-[#0A84FF] flex items-center justify-center font-extrabold text-[11px] border border-blue-100">
          {completedCount}
        </div>
        <span>Setup {completedCount}/{steps.length}</span>
      </button>

      {/* Smooth Pop-Up Animated Toast Modal */}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            id="setup-progress-panel"
            className="fixed inset-x-3 top-[132px] z-[60] space-y-4 overflow-hidden rounded-3xl border border-black/10 bg-white p-5 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.75rem)] sm:w-[336px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4" strokeWidth={2.2} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                      Step Accomplished!
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                      {completedCount}/{steps.length}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-gray-900 tracking-tight mt-0.5">
                    {justCompletedStep || 'Signal Setup Progress'}
                  </h4>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setVisible(false)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                aria-label="Close setup progress"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Checklist Items */}
            <div className="space-y-2 pt-1 border-t border-gray-100">
              {steps.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between p-2.5 rounded-2xl text-xs transition-all ${
                    s.done
                      ? 'bg-emerald-50/60 border border-emerald-200/60 text-emerald-950 font-semibold'
                      : 'bg-gray-50/60 border border-gray-100 text-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {s.done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={2.2} />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0" />
                    )}
                    <span className={`truncate text-xs ${s.done ? 'font-bold text-emerald-950' : 'font-medium text-gray-700'}`}>
                      {s.title}
                    </span>
                  </div>

                  {!s.done && s.link && (
                    <Link
                      href={s.link}
                      className="ml-1 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-[11px] font-bold text-[#0A84FF] hover:underline"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              ))}
            </div>

            {isAllComplete && (
              <div className="p-3 bg-emerald-500 text-white rounded-2xl text-xs font-bold text-center flex items-center justify-center gap-2 shadow-sm">
                <Sparkles className="w-4 h-4" /> Your signal radar is ready
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
