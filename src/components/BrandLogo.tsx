import Image from 'next/image'

interface BrandLogoProps {
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
  tone?: 'dark' | 'light'
}

const sizes = {
  sm: 22,
  md: 28,
  lg: 32,
}

export function BrandLogo({ compact = false, size = 'md', tone = 'dark' }: BrandLogoProps) {
  const pixels = sizes[size]

  return (
    <span className={`inline-flex items-center gap-2.5 font-display font-bold tracking-tight ${tone === 'light' ? 'text-white' : 'text-gray-950'}`}>
      <Image
        src="/buyerwatch_logo.png"
        alt=""
        width={pixels}
        height={pixels}
        className="rounded-full object-contain"
      />
      {!compact && <span>BuyerWatch</span>}
    </span>
  )
}
