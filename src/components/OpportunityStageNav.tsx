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
      className="mb-4 grid shrink-0 grid-cols-2 gap-1 rounded-2xl border border-[#E7E7E3] bg-[#F7F7F5] p-1.5"
    >
      {STAGES.map((stage) => {
        const Icon = stage.icon
        const isActive = stage.id === activeStage

        return (
          <Link
            key={stage.id}
            href={stage.href}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex min-h-14 items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 ${
              isActive
                ? 'bg-white text-[#1C1C1A] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06]'
                : 'text-[#6B6B66] hover:bg-white/70 hover:text-[#1C1C1A]'
            }`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
              isActive ? 'bg-[#EAF4FF] text-[#0A84FF]' : 'bg-white text-[#8C8C85] ring-1 ring-black/[0.05]'
            }`}>
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-semibold">{stage.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${
                  isActive ? 'bg-[#EEF5FF] text-[#0A67D0]' : 'bg-[#EAEAE7] text-[#6B6B66]'
                }`}>
                  {counts[stage.id]}
                </span>
              </span>
              <span className="mt-0.5 hidden truncate text-[11px] font-normal text-[#8C8C85] sm:block">
                {stage.description}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
