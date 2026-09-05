'use client'

import React, { useCallback, useId } from 'react'
import { Minus, Plus } from 'lucide-react'

export interface PremiumSliderProps {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  minLabel?: string
  maxLabel?: string
  disabled?: boolean
  onChange: (value: number) => void
  formatValue?: (value: number) => string
  accentColor?: 'dark' | 'blue' | 'emerald'
  className?: string
}

export function PremiumSlider({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  unit = '',
  minLabel,
  maxLabel,
  disabled = false,
  onChange,
  formatValue,
  accentColor = 'dark',
  className = '',
}: PremiumSliderProps) {
  const id = useId()
  const clampedValue = Math.min(max, Math.max(min, value))
  const percentage = max > min ? Math.min(100, Math.max(0, ((clampedValue - min) / (max - min)) * 100)) : 0

  const handleStepDown = useCallback(() => {
    if (disabled) return
    const next = Math.max(min, clampedValue - step)
    onChange(next)
  }, [disabled, min, clampedValue, step, onChange])

  const handleStepUp = useCallback(() => {
    if (disabled) return
    const next = Math.min(max, clampedValue + step)
    onChange(next)
  }, [disabled, max, clampedValue, step, onChange])

  const displayValue = formatValue ? formatValue(clampedValue) : `${clampedValue}${unit}`

  // Gradient accents
  const fillGradient = accentColor === 'blue'
    ? 'from-blue-600 to-indigo-600'
    : accentColor === 'emerald'
      ? 'from-emerald-600 to-teal-600'
      : 'from-neutral-950 via-neutral-900 to-neutral-800'

  const thumbBorder = accentColor === 'blue'
    ? 'border-blue-600'
    : accentColor === 'emerald'
      ? 'border-emerald-600'
      : 'border-neutral-950'

  const thumbCore = accentColor === 'blue'
    ? 'bg-blue-600'
    : accentColor === 'emerald'
      ? 'bg-emerald-600'
      : 'bg-neutral-950'

  return (
    <div className={`space-y-2.5 ${disabled ? 'opacity-55' : ''} ${className}`}>
      {/* Header with Title, Hint, and Value Stepper */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block text-[13px] font-semibold tracking-[-0.01em] text-neutral-900">
            {label}
          </label>
          {description && (
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-neutral-500">{description}</p>
          )}
        </div>

        {/* Tactile value pill & stepper buttons */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleStepDown}
            disabled={disabled || clampedValue <= min}
            aria-label={`Decrease ${label}`}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-neutral-200/80 bg-white text-neutral-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
          >
            <Minus className="h-3 w-3 stroke-[2.5]" />
          </button>

          <span
            className="inline-flex min-w-[42px] items-center justify-center rounded-lg border border-neutral-900 bg-neutral-900 px-2.5 py-1 text-center font-mono text-[12px] font-bold tabular-nums text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
            aria-live="polite"
          >
            {displayValue}
          </span>

          <button
            type="button"
            onClick={handleStepUp}
            disabled={disabled || clampedValue >= max}
            aria-label={`Increase ${label}`}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-neutral-200/80 bg-white text-neutral-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
          >
            <Plus className="h-3 w-3 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Slider Track and Thumb */}
      <div className="group relative flex h-7 items-center select-none">
        {/* Track backdrop */}
        <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-black/[0.06] bg-neutral-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
          {/* Active progress fill */}
          <div
            className={`h-full rounded-full bg-gradient-to-r ${fillGradient} transition-[width] duration-75`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Custom tactile thumb (follows percentage exactly) */}
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 transition-[left] duration-75"
          style={{ left: `${percentage}%` }}
        >
          <div
            className={`-translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full border-2 ${thumbBorder} bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.04)] transition-transform duration-150 group-hover:scale-110`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${thumbCore}`} />
          </div>
        </div>

        {/* Invisible native overlay range input for 100% native keyboard, touch, and accessibility handling */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={clampedValue}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          aria-label={label}
          aria-valuenow={clampedValue}
          aria-valuemin={min}
          aria-valuemax={max}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>

      {/* Range min/max markers */}
      {(minLabel || maxLabel) && (
        <div className="flex items-center justify-between text-[11px] font-medium text-neutral-400">
          <span>{minLabel || `${min}${unit}`}</span>
          <span>{maxLabel || `${max}${unit}`}</span>
        </div>
      )}
    </div>
  )
}
