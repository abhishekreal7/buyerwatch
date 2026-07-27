import { Target } from 'lucide-react'

interface BrandLogoProps {
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
  tone?: 'dark' | 'light'
}

const iconSizes = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
}

export function BrandLogo({ compact = false, size = 'md', tone = 'dark' }: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display font-bold tracking-tight ${tone === 'light' ? 'text-white' : 'text-gray-950'}`}>
      <span className="flex items-center justify-center rounded-xl bg-[#0A84FF]/10 p-1.5 border border-[#0A84FF]/20">
        <Target className={`${iconSizes[size]} text-[#0A84FF]`} strokeWidth={2.2} />
      </span>
      {!compact && <span>BuyerWatch</span>}
    </span>
  )
}
