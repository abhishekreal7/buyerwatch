'use client'
import React from 'react'
import { motion } from 'framer-motion'

interface RadialGaugeProps {
  percentage: number
  label: string
}

export function RadialGauge({ percentage, label }: RadialGaugeProps) {
  const tickCount = 42
  // Go from 180° (left) → 270° (top) → 360° (right) — through the TOP = arch shape
  const startAngle = 180
  const endAngle = 360
  const angleStep = (endAngle - startAngle) / (tickCount - 1)

  const radius = 120
  const tickLen = 32
  const cx = 138
  // cy near bottom of SVG so the arch is fully visible above it
  const cy = 160

  const safePercentage = Math.min(Math.max(percentage, 0), 100)
  // Reply-rate calculations are ratios and often produce repeating decimals
  // (for example 8.181818…). Keep the dashboard label readable and bounded.
  const displayPercentage = Number.isInteger(safePercentage)
    ? String(safePercentage)
    : (Math.round(safePercentage * 10) / 10).toFixed(1)
  const activeTicks = Math.round((safePercentage / 100) * tickCount)

  return (
    <div className="relative flex aspect-[276/198] w-full max-w-[276px] flex-col items-center justify-center">
      <svg className="h-full w-full overflow-visible" viewBox="0 0 276 198" role="img" aria-label={`${label}: ${displayPercentage}%`}>
        {Array.from({ length: tickCount }).map((_, i) => {
          const angle = startAngle + i * angleStep
          const angleRad = (angle * Math.PI) / 180

          const x2 = Math.round((cx + radius * Math.cos(angleRad)) * 10000) / 10000
          const y2 = Math.round((cy + radius * Math.sin(angleRad)) * 10000) / 10000
          const x1 = Math.round((cx + (radius - tickLen) * Math.cos(angleRad)) * 10000) / 10000
          const y1 = Math.round((cy + (radius - tickLen) * Math.sin(angleRad)) * 10000) / 10000

          const isActive = i < activeTicks

          let strokeColor: string
          if (isActive) {
            // Rich brand blue gradient (light blue to deep brand blue)
            const t = activeTicks > 1 ? i / (activeTicks - 1) : 0
            const r = Math.round(102 + (10 - 102) * t)
            const g = Math.round(178 + (132 - 178) * t)
            const b = Math.round(255 + (255 - 255) * t)
            strokeColor = `rgb(${r},${g},${b})`
          } else {
            strokeColor = '#EBF4FF' // Soft inactive blue track
          }

          return (
            <motion.line
              key={i}
              x1={x1} y1={y1}
              x2={x2} y2={y2}
              stroke={strokeColor}
              strokeWidth={5.0}
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, stroke: strokeColor }}
              transition={{ duration: 0.35, delay: i * 0.011 }}
            />
          )
        })}
      </svg>

      {/* Percentage label centered in the lower arc area */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ bottom: 15, left: 0, right: 0 }}
      >
        <span
          style={{
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            fontSize: 'clamp(30px, 11vw, 42px)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: '#0A0A0A',
            lineHeight: 1,
          }}
        >
          {displayPercentage}%
        </span>
        <span className="mt-2 text-center text-xs font-medium text-gray-500">{label}</span>
      </div>
    </div>
  )
}
