import { getIntentDisplayLabel } from '@/lib/intent'

type IntentBadgeProps = {
  score: number | null
  label?: string
  className?: string
}

export function IntentBadge({ score, label, className = '' }: IntentBadgeProps) {
  const normalizedScore = score === null ? null : Math.round(score)
  const isHighIntent = normalizedScore !== null && normalizedScore >= 80
  const isResearching = normalizedScore !== null && normalizedScore >= 60 && normalizedScore < 80
  const displayLabel = normalizedScore === null
    ? 'Awaiting analysis'
    : label || getIntentDisplayLabel(undefined, normalizedScore)

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
        isHighIntent
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 shadow-[0_1px_2px_rgba(16,185,129,0.08)]'
          : isResearching
          ? 'bg-slate-100/90 text-slate-700 ring-1 ring-slate-400/20'
          : 'bg-[#F2F2EF] text-[#6B6B66] ring-1 ring-black/[0.04]'
      } ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          isHighIntent ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : isResearching ? 'bg-slate-500' : 'bg-[#9E9E99]'
        }`}
        aria-hidden="true"
      />
      {normalizedScore !== null && <span className="tabular-nums font-bold">{normalizedScore}</span>}
      {normalizedScore !== null && <span className="opacity-40" aria-hidden="true">&middot;</span>}
      <span className="truncate">{displayLabel}</span>
    </span>
  )
}

