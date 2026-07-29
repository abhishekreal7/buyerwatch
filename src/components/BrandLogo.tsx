interface BrandLogoProps {
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
  tone?: 'dark' | 'light'
}

const dimensions = {
  sm: { icon: 22, text: 'text-[19px]' },
  md: { icon: 28, text: 'text-[24px]' },
  lg: { icon: 34, text: 'text-[29px]' },
}

export function BrandLogo({ compact = false, size = 'md', tone = 'dark' }: BrandLogoProps) {
  const dim = dimensions[size]
  const iconColor = tone === 'light' ? '#FFFFFF' : '#182A67'

  if (compact) {
    return (
      <span
        className="inline-flex shrink-0"
        style={{ width: `${dim.icon}px`, height: `${dim.icon}px` }}
        role="img"
        aria-label="BuyerWatch"
      >
        <svg viewBox="0 0 48 48" width={dim.icon} height={dim.icon} aria-hidden="true">
          <path
            d="M8 5h14.5C31.8 5 37 8.6 37 14.7c0 3.8-2 6.6-5.3 8.1 4.5 1.4 7.3 4.7 7.3 9.6C39 40 33.3 44 22.5 44H8V5Zm8 7v8.7h6c4.4 0 7-1.3 7-4.4 0-3-2.5-4.3-7-4.3h-6Zm0 15.7V37h6.6c4.7 0 7.4-1.8 7.4-5.1 0-3.1-2.7-4.2-7.4-4.2H16Z"
            fill={iconColor}
          />
          <ellipse cx="16.5" cy="24" rx="9.5" ry="6.1" fill="#FFFFFF" />
          <circle cx="16.5" cy="24" r="4.4" fill="#34C7B5" />
        </svg>
      </span>
    )
  }

  return (
    <span
      className={`${dim.text} inline-flex shrink-0 font-semibold leading-none tracking-[-0.05em]`}
      style={{ fontFamily: 'var(--font-serif), "Playfair Display", Georgia, serif' }}
      role="img"
      aria-label="BuyerWatch"
    >
      <span style={{ color: tone === 'light' ? '#FFFFFF' : '#2155D9' }}>Buyer</span>
      <span style={{ color: tone === 'light' ? '#FFFFFF' : '#171717' }}>Watch</span>
    </span>
  )
}
