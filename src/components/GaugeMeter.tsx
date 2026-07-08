import React from 'react'

export function GaugeMeter({ 
  value, 
  label,
  size = 180 
}: { 
  value: number
  label: string
  size?: number 
}) {
  const r = 70
  const cx = size / 2
  const cy = size / 2
  const circumference = Math.PI * r
  const offset = circumference - (value / 100) * circumference

  const color = value >= 80 
    ? '#30D158' 
    : value >= 60 
    ? '#FF9F0A' 
    : '#FF453A'

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
          stroke="#EBEBEB"
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
          fontFamily="Inter, sans-serif"
          fill="#0A0A0A"
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
          fontFamily="Inter, sans-serif"
          fill="#9B9B9B"
          letterSpacing="0.04em"
        >
          {label.toUpperCase()}
        </text>
      </svg>
    </div>
  )
}
