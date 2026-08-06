'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, LoaderCircle, ShieldAlert, ShieldCheck, ShieldQuestion, type LucideIcon } from 'lucide-react'

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
  Icon: LucideIcon
}> = {
  explicitly_allowed: {
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    Icon: ShieldCheck,
  },
  allowed_without_links: {
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    Icon: ShieldAlert,
  },
  promotion_thread_only: {
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    Icon: ShieldAlert,
  },
  promotion_prohibited: {
    className: 'border-rose-200 bg-rose-50 text-rose-800',
    Icon: ShieldAlert,
  },
  manual_review: {
    className: 'border-slate-200 bg-slate-50 text-slate-700',
    Icon: ShieldQuestion,
  },
  unavailable: {
    className: 'border-slate-200 bg-slate-50 text-slate-700',
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

  const { className, Icon } = STYLE_BY_STATUS[policy.status]
  if (compact) {
    return (
      <span title={policy.message} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${className}`}>
        <Icon className="h-3 w-3" /> {policy.label}
      </span>
    )
  }

  return (
    <aside className={`rounded-xl border px-3.5 py-3 text-[12px] ${className}`} aria-label="Community posting policy">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">r/{policy.subreddit}: {policy.label}</p>
          <p className="mt-0.5 leading-relaxed opacity-90">{policy.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <a
              href={policy.rulesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline"
            >
              Open rules <ExternalLink className="h-3 w-3" />
            </a>
            {policy.promotionThread && (
              <a
                href={policy.promotionThread.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline"
              >
                {policy.promotionThread.title} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
