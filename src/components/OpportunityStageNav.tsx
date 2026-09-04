import Link from 'next/link'

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
  },
  {
    id: 'replies' as const,
    href: '/opportunities/replies',
    label: 'Reply queue',
    description: 'Draft, edit, and publish safely',
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
      className="flex items-center gap-7 border-b border-gray-200/80 mb-5 shrink-0"
    >
      {STAGES.map((stage) => {
        const isActive = stage.id === activeStage

        return (
          <Link
            key={stage.id}
            href={stage.href}
            aria-current={isActive ? 'page' : undefined}
            className={`group relative flex items-center gap-2 pb-3 text-[13.5px] transition-colors cursor-pointer outline-none ${
              isActive
                ? 'font-semibold text-gray-950'
                : 'font-medium text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>{stage.label}</span>
            <span
              className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200/80 group-hover:text-gray-900'
              }`}
            >
              {counts[stage.id]}
            </span>
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-900 rounded-full" />
            )}
            <span className="sr-only">{stage.description}</span>
          </Link>
        )
      })}
    </nav>
  )
}
