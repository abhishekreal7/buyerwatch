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

  return (
    <span className={`inline-flex items-center gap-2.5 tracking-tight ${tone === 'light' ? 'text-white' : 'text-gray-950'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/buyerwatch_logo.png"
        alt="BuyerWatch Logo"
        width={dim.px}
        height={dim.px}
        style={{ width: `${dim.px}px`, height: `${dim.px}px` }}
        className="rounded-full object-contain shrink-0"
      />
      {!compact && (
        <span
          className={`${dim.text} leading-none tracking-normal inline-flex items-baseline gap-1.5`}
          style={{ fontFamily: 'var(--font-serif), "Playfair Display", Georgia, serif' }}
        >
          <span className="text-[#9E9E9E] font-normal italic">the</span>
          <span className="text-[#D34519] font-normal">buyer</span>
          <span className="text-[#2C2C2E] font-normal">Watch</span>
        </span>
      )}
    </span>
  )
}
