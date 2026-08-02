import { getIntentDisplayLabel } from '@/lib/intent'

type IntentBadgeProps = {
  score: number | null
  label?: string
  className?: string
}

export function IntentBadge({ score, label, className = '' }: IntentBadgeProps) {
  const normalizedScore = score === null ? null : Math.round(score)
  const isHighIntent = normalizedScore !== null && normalizedScore >= 80
  const displayLabel = normalizedScore === null
    ? 'Awaiting analysis'
    : label || getIntentDisplayLabel(undefined, normalizedScore)

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${
        isHighIntent
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-[#E2E4E9] text-[#4F5865]'
      } ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          isHighIntent ? 'bg-emerald-500' : 'bg-[#8B9099]'
        }`}
        aria-hidden="true"
      />
      {normalizedScore !== null && <span className="tabular-nums">{normalizedScore}</span>}
      {normalizedScore !== null && <span aria-hidden="true">&middot;</span>}
      <span>{displayLabel}</span>
    </span>
  )
}
