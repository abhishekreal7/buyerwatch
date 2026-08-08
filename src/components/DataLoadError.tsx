'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

type DataLoadErrorProps = {
  title: string
  description: string
  onRetry: () => void
  className?: string
}

export function DataLoadError({ title, description, onRetry, className = '' }: DataLoadErrorProps) {
  return (
    <div
      role="alert"
      className={`flex min-h-64 flex-col items-center justify-center px-6 py-14 text-center ${className}`}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
      </div>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#667085]">{description}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#DDE2E8] bg-white px-4 text-xs font-semibold text-[#344054] shadow-xs transition-colors hover:bg-[#F7F8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30"
      >
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Try again
      </button>
    </div>
  )
}
