import Image from 'next/image'

interface BrandLogoProps {
  compact?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  tone?: 'dark' | 'light'
}

const dimensions = {
  sm: { height: 22, width: 101 },
  md: { height: 28, width: 129 },
  lg: { height: 34, width: 156 },
  xl: { height: 44, width: 202 },
}

export function BrandLogo({ compact = false, size = 'md', tone = 'dark' }: BrandLogoProps) {
  const dim = dimensions[size]
  const imageStyle = tone === 'light' ? { filter: 'brightness(0) invert(1)' } : undefined

  if (compact) {
    return (
      <span className="inline-flex shrink-0" style={{ width: dim.height, height: dim.height }}>
        <Image
          src="/buyerwatch-icon.png"
          alt="BuyerWatch"
          width={128}
          height={128}
          loading="eager"
          unoptimized
          className="h-full w-full object-contain"
          style={imageStyle}
        />
      </span>
    )
  }

  return (
    <span
      className="inline-flex shrink-0 items-center"
      style={{ width: dim.width, height: dim.height }}
      role="img"
      aria-label="BuyerWatch"
    >
      <Image
        src="/buyerwatch-brand.png"
        alt=""
        width={803}
        height={175}
        loading="eager"
        unoptimized
        className="h-full w-full object-contain"
        style={imageStyle}
      />
    </span>
  )
}
