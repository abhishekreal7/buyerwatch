interface BrandLogoProps {
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
  tone?: 'dark' | 'light'
}

const imgSizes = {
  sm: 'w-6 h-6',
  md: 'w-7.5 h-7.5',
  lg: 'w-9 h-9',
}

export function BrandLogo({ compact = false, size = 'md', tone = 'dark' }: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display font-bold tracking-tight ${tone === 'light' ? 'text-white' : 'text-gray-950'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/buyerwatch_logo.png"
        alt="BuyerWatch Logo"
        className={`${imgSizes[size]} rounded-full object-contain shrink-0`}
      />
      {!compact && <span>BuyerWatch</span>}
    </span>
  )
}
