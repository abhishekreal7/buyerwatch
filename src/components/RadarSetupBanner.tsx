'use client'

import { useState, useEffect } from 'react'
import { Target, CheckCircle2, ChevronUp, ChevronDown, X, ArrowRight } from 'lucide-react'

interface RadarSetupBannerProps {
  keywordsCount: number
  hasInspectedLead: boolean
  hasCopiedOrApproved: boolean
  autoSendEnabled: boolean
}

export function RadarSetupBanner({
  keywordsCount,
  hasInspectedLead,
  hasCopiedOrApproved,
  autoSendEnabled,
}: RadarSetupBannerProps) {
  const [minimized, setMinimized] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const savedMinimized = localStorage.getItem('scouto_setup_minimized') === 'true'
    const savedDismissed = localStorage.getItem('scouto_setup_dismissed') === 'true'
    if (savedMinimized) setMinimized(true)
    if (savedDismissed) setDismissed(true)
  }, [])

  const steps = [
    {
      id: 'keyword',
      title: 'Topic Monitored',
      desc: 'Add at least 1 keyword',
      done: keywordsCount > 0,
      link: '/keywords',
    },
    {
      id: 'inspect',
      title: 'Inspect First Lead',
      desc: 'Click a lead to view intent reasoning',
      done: hasInspectedLead,
    },
    {
      id: 'reply',
      title: 'Copy / Approve Reply',
      desc: 'Copy or approve an AI draft',
      done: hasCopiedOrApproved,
    },
    {
      id: 'autosend',
      title: 'Auto-send Ready',
      desc: 'Toggle Auto-send in topbar',
      done: autoSendEnabled,
    },
  ]

  const completedCount = steps.filter(s => s.done).length
  const isAllComplete = completedCount === steps.length

  if (dismissed || isAllComplete) return null

  const handleToggleMinimize = () => {
    const next = !minimized
    setMinimized(next)
    localStorage.setItem('scouto_setup_minimized', String(next))
  }

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('scouto_setup_dismissed', 'true')
  }

  return (
    <div className="bg-white border border-black/[0.08] rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all relative overflow-hidden">
      {/* Top Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0A84FF] flex items-center justify-center shrink-0">
            <Target className="w-4 h-4" strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-gray-900 tracking-tight">Signal Setup Progress</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#0A84FF]">
                {completedCount} of {steps.length} complete
              </span>
            </div>
            <p className="text-[11px] text-gray-500 font-medium mt-0.5">
              Complete these steps to improve your buyer-intent monitoring.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <button
            onClick={handleToggleMinimize}
            className="flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
            aria-expanded={!minimized}
          >
            {minimized ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> Show setup guide
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Minimize
              </>
            )}
          </button>
          <button
            onClick={handleDismiss}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Dismiss setup guide"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded Steps Row */}
      {!minimized && (
        <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {steps.map((s, idx) => (
            <div
              key={s.id}
              className={`p-3 rounded-xl border transition-all ${
                s.done
                  ? 'bg-emerald-50/50 border-emerald-200/60'
                  : 'bg-gray-50/70 border-gray-200/70'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Step {idx + 1}</span>
                {s.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={2.2} />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0" />
                )}
              </div>
              <h4 className={`text-xs font-semibold ${s.done ? 'text-emerald-950' : 'text-gray-900'}`}>
                {s.title}
              </h4>
              <p className="text-[11px] text-gray-500 mt-0.5 font-normal leading-tight">
                {s.desc}
              </p>
              {!s.done && s.link && (
                <a
                  href={s.link}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0A84FF] hover:underline mt-2"
                >
                  Configure <ArrowRight className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
