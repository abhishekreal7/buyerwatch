import Link from 'next/link'
import { MessageSquareText, ScanSearch } from 'lucide-react'

type OpportunityStage = 'review' | 'replies'

type OpportunityStageNavProps = {
  activeStage: OpportunityStage
  reviewCount: number
  replyCount: number
}

const STAGES = [
  {
    id: 'review' as const,
    href: '/opportunities',
    label: 'Review leads',
    description: 'Qualified conversations to assess',
    icon: ScanSearch,
  },
  {
    id: 'replies' as const,
    href: '/opportunities/replies',
    label: 'Reply queue',
    description: 'Draft, edit, and publish safely',
    icon: MessageSquareText,
  },
]

export function OpportunityStageNav({
  activeStage,
  reviewCount,
  replyCount,
}: OpportunityStageNavProps) {
  const counts: Record<OpportunityStage, number> = {
    review: reviewCount,
    replies: replyCount,
  }

  return (
    <nav
      aria-label="Opportunity workflow"
      className="mb-4 grid shrink-0 grid-cols-2 gap-1.5 rounded-2xl border border-black/[0.06] bg-[#F4F4F2]/80 p-1.5 backdrop-blur-sm shadow-inner"
    >
      {STAGES.map((stage) => {
        const Icon = stage.icon
        const isActive = stage.id === activeStage

        return (
          <Link
            key={stage.id}
            href={stage.href}
            aria-current={isActive ? 'page' : undefined}
            className={`group relative flex min-h-[52px] items-center gap-3 rounded-xl px-4 py-2.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 ${
              isActive
                ? 'bg-white text-[#1C1C1A] shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06]'
                : 'text-[#6B6B66] hover:bg-white/60 hover:text-[#1C1C1A]'
            }`}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50 text-[#0A84FF] shadow-xs'
                  : 'bg-white/80 text-[#8C8C85] ring-1 ring-black/[0.04] group-hover:text-[#555]'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[13.5px] font-bold tracking-tight">{stage.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums transition-colors ${
                    isActive
                      ? 'bg-blue-100/70 text-[#0A67D0]'
                      : 'bg-black/[0.05] text-[#6B6B66] group-hover:bg-black/[0.08]'
                  }`}
                >
                  {counts[stage.id]}
                </span>
              </span>
              <span className="mt-0.5 hidden truncate text-[11px] font-medium text-[#8C8C85] sm:block">
                {stage.description}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

