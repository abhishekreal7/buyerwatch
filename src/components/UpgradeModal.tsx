'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, Sparkles, Shield } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { normalizePlan } from '@/lib/plan-limits'

interface UpgradeModalProps {
  userId: string
  plan: string
  keywordsUsed: number
  keywordsMax: number
}

/**
 * UpgradeModal — shown once per user per plan tier per browser, immediately
 * after upgrading to Professional or Growth.
 *
 * Trigger: plan is pro/growth AND the localStorage dismissal key doesn't exist.
 * Dismissal: clicking the CTA or ✕ sets the key and the modal never shows again.
 *
 * Uses localStorage only — no DB migration needed.
 */
export function UpgradeModal({ userId, plan, keywordsUsed, keywordsMax }: UpgradeModalProps) {
  const [visible, setVisible] = useState(false)
  const [draftsReviewed, setDraftsReviewed] = useState(0)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const storageKey = `scouto_seen_upgrade_modal_${userId}_${plan}`

  useEffect(() => {
    if (normalizePlan(plan) === 'free') return
    if (typeof window === 'undefined') return
    if (localStorage.getItem(storageKey)) return

    // Load trust metrics for the "drafts reviewed" counter
    supabase
      .from('user_trust_metrics')
      .select('total_drafts_reviewed')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setDraftsReviewed(Math.min(data?.total_drafts_reviewed ?? 0, 10))
      })

    // Small delay so the dashboard loads first — avoids flash-of-modal on slow connections
    const t = setTimeout(() => setVisible(true), 600)
    return () => clearTimeout(t)

  }, [userId, plan])

  function dismiss() {
    localStorage.setItem(storageKey, '1')
    setVisible(false)
  }

  useEffect(() => {
    if (!visible) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [visible])

  const tierLabel = normalizePlan(plan) === 'growth' ? 'Growth' : 'Professional'

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-50"
            onClick={dismiss}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 top-1/2 -translate-y-1/2 z-50 mx-auto w-full max-w-[420px] px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-modal-title"
            aria-describedby="upgrade-modal-description"
          >
            <div className="bg-white rounded-[24px] shadow-[0_24px_80px_rgba(0,0,0,0.18)] p-8 relative">
              {/* Close */}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={dismiss}
                className="absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                aria-label="Close upgrade details"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>

              {/* Icon */}
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-5">
                <Sparkles className="w-5 h-5 text-amber-500" strokeWidth={1.75} />
              </div>

              {/* Headline */}
              <h2 id="upgrade-modal-title" className="text-[22px] font-bold text-gray-900 tracking-tight mb-1">
                You&apos;re on {tierLabel}.
              </h2>

              {/* Keyword slots */}
              <p id="upgrade-modal-description" className="text-[14px] text-gray-600 leading-relaxed mb-5">
                You now have{' '}
                <span className="font-semibold text-gray-900">{keywordsMax} keyword slots</span>{' '}
                {keywordsUsed > 0 && (
                  <>
                    (you&apos;ve used <span className="font-semibold text-gray-900">{keywordsUsed}</span>).
                  </>
                )}
                {keywordsUsed === 0 && '— add your first below.'}
                {' '}Each keyword is a different set of conversations you&apos;re now visible in.
              </p>

              {/* Primary CTA */}
              <Link
                href="/keywords"
                onClick={dismiss}
                className="flex items-center justify-center gap-2 w-full bg-gray-900 hover:bg-gray-800 text-white text-[14px] font-semibold py-3 rounded-[14px] transition-colors mb-4"
              >
                Add your{keywordsUsed >= 1 ? ' next' : ' first'} keyword
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </Link>

              {/* Auto-send trust note */}
              <div className="flex items-start gap-2.5 p-3.5 bg-gray-50 rounded-[12px] border border-gray-100">
                <Shield className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" strokeWidth={1.75} />
                <p className="text-[12.5px] text-gray-500 leading-relaxed">
                  Auto-send unlocks once you&apos;ve reviewed{' '}
                  <span className="font-semibold text-gray-700">10 drafts</span> — you&apos;ve reviewed{' '}
                  <span className="font-semibold text-gray-700">{draftsReviewed} so far</span>.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
