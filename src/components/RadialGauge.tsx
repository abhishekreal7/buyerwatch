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

  const radius = 96
  const tickLen = 25
  const cx = 110
  // cy near bottom of SVG so the arch is fully visible above it
  const cy = 128

  const safePercentage = Math.min(Math.max(percentage, 0), 100)
  const activeTicks = Math.round((safePercentage / 100) * tickCount)

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: 220, height: 158 }}>
      <svg width="220" height="158" viewBox="0 0 220 158" style={{ overflow: 'visible' }}>
        {Array.from({ length: tickCount }).map((_, i) => {
          const angle = startAngle + i * angleStep
          const angleRad = (angle * Math.PI) / 180

          const x2 = cx + radius * Math.cos(angleRad)
          const y2 = cy + radius * Math.sin(angleRad)
          const x1 = cx + (radius - tickLen) * Math.cos(angleRad)
          const y1 = cy + (radius - tickLen) * Math.sin(angleRad)

          const isActive = i < activeTicks

          let strokeColor: string
          if (isActive) {
            // Deep coral → light salmon as ticks progress left→right
            const t = activeTicks > 1 ? i / (activeTicks - 1) : 0
            const r = Math.round(232 + (245 - 232) * t)
            const g = Math.round(67 + (160 - 67) * t)
            const b = Math.round(45 + (138 - 45) * t)
            strokeColor = `rgb(${r},${g},${b})`
          } else {
            strokeColor = '#F5DDD9'
          }

          return (
            <motion.line
              key={i}
              x1={x1} y1={y1}
              x2={x2} y2={y2}
              stroke={strokeColor}
              strokeWidth={4.0}
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
        className="absolute flex items-center justify-center"
        style={{ bottom: 10, left: 0, right: 0 }}
      >
        <span
          style={{
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            fontSize: '34px',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: '#0A0A0A',
            lineHeight: 1,
          }}
        >
          {safePercentage}%
        </span>
      </div>
    </div>
  )
}
