interface BrandLogoProps {
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
  tone?: 'dark' | 'light'
}

const dimensions = {
  sm: { px: 22, text: 'text-[17px]' },
  md: { px: 28, text: 'text-[21px]' },
  lg: { px: 34, text: 'text-[25px]' },
}

export function BrandLogo({ compact = false, size = 'md', tone = 'dark' }: BrandLogoProps) {
  const dim = dimensions[size]

  return compact ? (
    <span
      className="inline-flex shrink-0"
      style={{ width: `${dim.px}px`, height: `${dim.px}px` }}
    >
      <img
        src="/buyerwatch_logo.png"
        alt="BuyerWatch"
        width={dim.px}
        height={dim.px}
        className="h-full w-full rounded-full object-contain"
      />
    </span>
  ) : (
    <span
      className={`${dim.text} inline-flex items-baseline gap-1.5 leading-none tracking-normal`}
      style={{ fontFamily: 'var(--font-serif), "Playfair Display", Georgia, serif' }}
      aria-label="the buyer Watch"
    >
      <span className="font-normal italic" style={{ color: tone === 'light' ? '#D8D8D8' : '#9E9E9E' }}>the</span>
      <span className="font-normal" style={{ color: tone === 'light' ? '#FFFFFF' : '#D34519' }}>buyer</span>
      <span className="font-normal" style={{ color: tone === 'light' ? '#FFFFFF' : '#2C2C2E' }}>Watch</span>
    </span>
  )
}
