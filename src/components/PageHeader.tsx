import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string | ReactNode
  action?: ReactNode
}

/**
 * Shared page title component used across all sidebar pages.
 *
 * Typography spec:
 *  - font-family: -apple-system stack, with Inter as the explicit non-Apple fallback
 *    so tight letter-spacing still reads intentional on Windows/Chrome
 *  - font-weight: 700 (not 800/900 — has more character at display sizes)
 *  - letter-spacing: -0.02em (tightens loose default tracking at 34px)
 *  - color: rgba(0,0,0,0.92) — Apple never uses pure black for headings
 *  - line-height: 1.15 (display text needs slightly tighter leading than body)
 *
 * Subtitle contrasts deliberately with lower weight (400) and lower opacity (0.56)
 * to create optical hierarchy pairing.
 */
export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5 font-medium">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center shrink-0">{action}</div>}
    </div>
  )
}
