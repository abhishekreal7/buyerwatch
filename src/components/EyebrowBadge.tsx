'use client'

import { motion, useReducedMotion } from 'framer-motion'

const ANIMATION_ENABLED = true
const STAR = String.fromCharCode(10022)

// Static version — fallback for reduced motion
function StaticBadge() {
  return (
    <div className="flex items-center gap-2 mb-8">
      <span className="w-2 h-2 rounded-full bg-[#0A84FF] animate-pulse flex-shrink-0 inline-block" />
      <span className="text-sm font-medium text-[#0A84FF]">{STAR} Stop waiting for inbound leads</span>
    </div>
  )
}

// AE-quality animated version:
//   DOT  — 4 keyframes: anticipatory dip (coil) -> explosive launch -> gravity fall
//   STAR — 4 keyframes: AE burst curve -> spring overshoot -> asymmetric settle
//   Both synchronized with DURATION + REST
function AnimatedBadge() {
  const shouldReduceMotion = useReducedMotion()
  if (shouldReduceMotion) return <StaticBadge />

  const DURATION = 1.2
  const REST = 1.5

  return (
    <div className="flex items-center gap-2 mb-8">
      {/* DOT: +2px dip (anticipation) then -8px throw then gravity fall */}
      <motion.span
        className="w-2 h-2 rounded-full bg-[#0A84FF] flex-shrink-0 inline-block"
        animate={{ y: [0, 2, -8, 0] }}
        transition={{
          duration: DURATION,
          repeat: Infinity,
          repeatType: 'loop',
          repeatDelay: REST,
          times: [0, 0.08, 0.42, 1],
          ease: [
            [0.55, 0, 1, 0.45],
            [0.0, 0.7, 0.3, 1.0],
            [0.55, 0, 1.0, 0.45],
          ],
        }}
        style={{ willChange: 'transform' }}
      />

      {/* STAR: AE burst -> spring overshoot -> asymmetric settle */}
      <motion.span
        className="text-[#0A84FF] inline-flex flex-shrink-0 leading-none text-sm"
        animate={{ rotate: [0, 360, 374, 360] }}
        transition={{
          duration: DURATION,
          repeat: Infinity,
          repeatType: 'loop',
          repeatDelay: REST,
          times: [0, 0.52, 0.72, 1],
          ease: [
            [0.14, 0, 0.21, 1],
            [0.34, 1.56, 0.64, 1],
            [0.68, -0.6, 0.32, 1.29],
          ],
        }}
        style={{ willChange: 'transform' }}
      >
        {STAR}
      </motion.span>

      <span className="text-sm font-medium text-[#0A84FF]">Stop waiting for inbound leads</span>
    </div>
  )
}

export default function EyebrowBadge() {
  return ANIMATION_ENABLED ? <AnimatedBadge /> : <StaticBadge />
}
