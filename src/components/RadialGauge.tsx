import React from 'react'
import { motion } from 'framer-motion'

interface RadialGaugeProps {
  percentage: number
  label: string
}

export function RadialGauge({ percentage, label }: RadialGaugeProps) {
  const tickCount = 20
  const startAngle = -120
  const endAngle = 120
  const angleRange = endAngle - startAngle
  const angleStep = angleRange / (tickCount - 1)

  const radius = 90
  const cx = 100
  const cy = 110
  const tickLength = 16
  const strokeWidth = 5

  const safePercentage = Math.min(Math.max(percentage, 0), 100)
  const activeTicks = Math.round((safePercentage / 100) * tickCount)

  return (
    <div className="flex flex-col items-center justify-center relative w-[200px]">
      <svg width="200" height="160" viewBox="0 0 200 160" className="overflow-visible">
        {Array.from({ length: tickCount }).map((_, i) => {
          const angle = startAngle + i * angleStep
          const angleRad = (angle - 90) * (Math.PI / 180)
          
          const x1 = cx + (radius - tickLength) * Math.cos(angleRad)
          const y1 = cy + (radius - tickLength) * Math.sin(angleRad)
          
          const x2 = cx + radius * Math.cos(angleRad)
          const y2 = cy + radius * Math.sin(angleRad)

          const isActive = i < activeTicks

          return (
            <motion.line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isActive ? '#0A84FF' : '#E5E5EA'}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              initial={{ stroke: '#E5E5EA' }}
              animate={{ stroke: isActive ? '#0A84FF' : '#E5E5EA' }}
              transition={{ duration: 0.5, delay: i * 0.03 }}
            />
          )
        })}
      </svg>
      
      <div className="absolute top-[70px] left-0 right-0 flex flex-col items-center text-center">
        <span className="text-[34px] font-bold text-text-primary tracking-tight leading-none tabular-nums">
          {safePercentage.toFixed(1)}%
        </span>
        <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mt-2 max-w-[90px] leading-tight">
          {label}
        </span>
      </div>
    </div>
  )
}
