'use client'

import React from 'react'

export interface PlatformToggleCardProps {
  icon: React.ReactNode
  name: string
  statusText: string
  statusType?: 'ready' | 'warning' | 'disabled'
  checked: boolean
  disabled?: boolean
  disabledNotice?: string
  onChange: (checked: boolean) => void
}

export function PlatformToggleCard({
  icon,
  name,
  statusText,
  statusType = 'ready',
  checked,
  disabled = false,
  disabledNotice,
  onChange,
}: PlatformToggleCardProps) {
  const statusColor = statusType === 'ready'
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200/70'
    : statusType === 'warning'
      ? 'text-amber-700 bg-amber-50 border-amber-200/70'
      : 'text-neutral-500 bg-neutral-100 border-neutral-200/60'

  const dotColor = statusType === 'ready'
    ? 'bg-emerald-500'
    : statusType === 'warning'
      ? 'bg-amber-500'
      : 'bg-neutral-400'

  return (
    <div
      onClick={() => {
        if (!disabled) onChange(!checked)
      }}
      className={`relative flex items-center justify-between gap-4 rounded-xl border p-3.5 transition-all duration-200 ${
        disabled
          ? 'cursor-not-allowed border-neutral-200/70 bg-neutral-50/60 opacity-60'
          : checked
            ? 'cursor-pointer border-neutral-900/20 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_16px_rgba(0,0,0,0.03)] hover:border-neutral-900/30'
            : 'cursor-pointer border-neutral-200/80 bg-white hover:border-neutral-300 hover:bg-neutral-50/40'
      }`}
    >
      {/* Left: Icon & Info */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200/70 bg-neutral-50/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-neutral-900">{name}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${statusColor}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
              {statusText}
            </span>
          </div>
          {disabledNotice && (
            <p className="mt-0.5 text-[11px] leading-tight text-neutral-400">{disabledNotice}</p>
          )}
        </div>
      </div>

      {/* Right: Switch Toggle */}
      <div className="shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={e => {
            e.stopPropagation()
            if (!disabled) onChange(!checked)
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
            checked ? 'bg-neutral-900' : 'bg-neutral-200'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] ring-0 transition duration-200 ease-in-out ${
              checked ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
