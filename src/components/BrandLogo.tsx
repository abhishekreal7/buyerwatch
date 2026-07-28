interface BrandLogoProps {
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
  tone?: 'dark' | 'light'
}

const dimensions = {
  sm: { px: 22, text: 'text-[17px]' },
  md: { px: 30, text: 'text-[22px]' },
  lg: { px: 36, text: 'text-[27px]' },
}

export function BrandLogo({ compact = false, size = 'md', tone = 'dark' }: BrandLogoProps) {
  const dim = dimensions[size]

  return (
    <span className={`inline-flex items-center gap-2.5 tracking-tight ${tone === 'light' ? 'text-white' : 'text-gray-950'}`}>
      <span className="shrink-0" style={{ width: `${dim.px}px`, height: `${dim.px}px` }}>
        <img
          src="/buyerwatch_logo.png"
          alt={compact ? 'BuyerWatch' : ''}
          width={dim.px}
          height={dim.px}
          className="h-full w-full rounded-full object-contain"
        />
      </span>
      {!compact && (
        <span
          className={`${dim.text} inline-flex font-semibold leading-none tracking-[-0.045em]`}
          style={{ fontFamily: 'var(--font-serif), "Playfair Display", Georgia, serif' }}
        >
          <span style={{ color: tone === 'light' ? '#FFFFFF' : '#2155D9' }}>Buyer</span>
          <span style={{ color: tone === 'light' ? '#FFFFFF' : '#171717' }}>Watch</span>
        </span>
      )}
    </span>
  )
}
