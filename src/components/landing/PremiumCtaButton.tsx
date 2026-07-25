import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

type PremiumCtaButtonProps = {
  children: ReactNode
  className?: string
  fullWidth?: boolean
  href: string
}

export function PremiumCtaButton({
  children,
  className = '',
  fullWidth = false,
  href,
}: PremiumCtaButtonProps) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-3 rounded-full border border-white bg-[linear-gradient(115deg,#3b3b3b_0%,#171717_48%,#050505_100%)] py-1.5 pl-5 pr-1.5 text-[14px] font-semibold text-white shadow-[inset_3px_3px_7px_rgba(255,255,255,0.18),inset_-3px_-3px_7px_rgba(255,255,255,0.06),0_12px_25px_rgba(0,0,0,0.24)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[inset_3px_3px_7px_rgba(255,255,255,0.22),inset_-3px_-3px_7px_rgba(255,255,255,0.08),0_16px_30px_rgba(0,0,0,0.28)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0a84ff]/25 ${fullWidth ? 'w-full justify-between' : ''} ${className}`}
    >
      <span className={fullWidth ? 'flex-1 pl-9 text-center' : ''}>{children}</span>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.14)] transition-transform duration-300 group-hover:rotate-45"
      >
        <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
      </span>
    </Link>
  )
}
