'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, LoaderCircle, ShieldAlert, ShieldCheck, ShieldQuestion, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'

type CommunityPolicy = {
  subreddit: string
  status: 'explicitly_allowed' | 'allowed_without_links' | 'promotion_thread_only' | 'promotion_prohibited' | 'manual_review' | 'unavailable'
  label: string
  message: string
  rulesUrl: string
  promotionThread: { title: string; url: string } | null
}

const STYLE_BY_STATUS: Record<CommunityPolicy['status'], {
  className: string
  badgeClass: string
  Icon: LucideIcon
}> = {
  explicitly_allowed: {
    className: 'border-emerald-200/80 bg-emerald-50/70 text-emerald-900',
    badgeClass: 'bg-emerald-100/80 text-emerald-800 border-emerald-300/60',
    Icon: ShieldCheck,
  },
  allowed_without_links: {
    className: 'border-amber-200/80 bg-amber-50/70 text-amber-900',
    badgeClass: 'bg-amber-100/80 text-amber-800 border-amber-300/60',
    Icon: ShieldAlert,
  },
  promotion_thread_only: {
    className: 'border-amber-200/80 bg-amber-50/70 text-amber-900',
    badgeClass: 'bg-amber-100/80 text-amber-800 border-amber-300/60',
    Icon: ShieldAlert,
  },
  promotion_prohibited: {
    className: 'border-rose-200/80 bg-rose-50/70 text-rose-900',
    badgeClass: 'bg-rose-100/80 text-rose-800 border-rose-300/60',
    Icon: ShieldAlert,
  },
  manual_review: {
    className: 'border-slate-200/80 bg-slate-50/70 text-slate-800',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300/60',
    Icon: ShieldQuestion,
  },
  unavailable: {
    className: 'border-slate-200/80 bg-slate-50/70 text-slate-800',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300/60',
    Icon: ShieldQuestion,
  },
}

export function RedditCommunityPolicyNotice({
  subreddit,
  compact = false,
}: {
  subreddit: string
  compact?: boolean
}) {
  const [policy, setPolicy] = useState<CommunityPolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setPolicy(null)

    void (async () => {
      try {
        const response = await fetch(
          `/api/reddit/community-policy?subreddit=${encodeURIComponent(subreddit)}`,
          { signal: controller.signal },
        )
        const payload = await response.json().catch(() => null) as { policy?: CommunityPolicy } | null
        if (!controller.signal.aborted && response.ok && payload?.policy) {
          setPolicy(payload.policy)
        }
      } catch {
        // The fallback below remains visible and explicitly keeps delivery manual.
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [subreddit])

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Checking community rules…
      </span>
    )
  }

  if (!policy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
        <ShieldQuestion className="h-3.5 w-3.5" /> Rules check unavailable — manual review only
      </span>
    )
  }

  const { className, badgeClass, Icon } = STYLE_BY_STATUS[policy.status]
  if (compact) {
    return (
      <span title={policy.message} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold ${badgeClass}`}>
        <Icon className="h-3 w-3" /> {policy.label}
      </span>
    )
  }

  return (
    <aside className={`rounded-xl border px-3.5 py-2.5 text-[12px] transition-all ${className}`} aria-label="Community posting policy">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon className="h-4 w-4 shrink-0 opacity-80" />
          <span className="font-semibold text-[12.5px] truncate">
            r/{policy.subreddit}: <span className="font-normal opacity-90">{policy.label}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={policy.rulesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Open rules <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() => setIsExpanded(v => !v)}
            aria-label={isExpanded ? 'Hide policy details' : 'Show policy details'}
            className="grid h-5 w-5 place-items-center rounded-md hover:bg-black/5 text-current opacity-70 hover:opacity-100"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-black/10">
          <p className="leading-relaxed opacity-90">{policy.message}</p>
          {policy.promotionThread && (
            <div className="mt-1.5 flex items-center">
              <a
                href={policy.promotionThread.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline"
              >
                {policy.promotionThread.title} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

