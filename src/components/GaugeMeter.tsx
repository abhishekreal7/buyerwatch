import React from 'react'

export function GaugeMeter({ 
  value, 
  label,
  size = 180,
  textColor = '#0A0A0A',
  trackColor = '#EBEBEB'
}: { 
  value: number
  label: string
  size?: number 
  textColor?: string
  trackColor?: string
}) {
  const r = 70
  const cx = size / 2
  const cy = size / 2
  const circumference = Math.PI * r
  const offset = circumference - (value / 100) * circumference

  const color = value >= 80 
    ? '#0A84FF' 
    : value >= 60 
    ? '#64D2FF' 
    : '#8E8E93'

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px'
    }}>
      <svg 
        width={size} 
        height={size / 2 + 20}
        viewBox={`0 0 ${size} ${size / 2 + 20}`}
      >
        {/* Background track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={trackColor}
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Value fill */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        {/* Center value */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize="32"
          fontWeight="700"
          fontFamily="var(--font-jakarta), var(--font-inter), sans-serif"
          fill={textColor}
          letterSpacing="-0.03em"
        >
          {value}
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontSize="12"
          fontWeight="500"
          fontFamily="var(--font-inter), sans-serif"
          fill="#9B9B9B"
          letterSpacing="0.04em"
        >
          {label.toUpperCase()}
        </text>
      </svg>
    </div>
  )
}
