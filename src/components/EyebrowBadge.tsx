'use client'

import { motion, useReducedMotion } from 'framer-motion'

// INSTANT REVERT: flip ANIMATION_ENABLED to false
// FULL GIT REVERT: git checkout 6cf369f -- src/app/page.tsx; Remove-Item src/components/EyebrowBadge.tsx
const ANIMATION_ENABLED = true

const STAR = String.fromCharCode(10022)

// Static version — pixel-identical to the pre-animation badge, kept intact as fallback
function StaticBadge() {
  return (
    <div className="flex items-center gap-2 mb-8">
      <span className="w-2 h-2 rounded-full bg-[#0A84FF] animate-pulse flex-shrink-0 inline-block" />
      <span className="text-sm font-medium text-[#0A84FF]">{STAR} Stop waiting for inbound leads</span>
    </div>
  )
}

// AE-quality animated version
// Principles applied:
//   DOT  — 4 keyframes: anticipatory dip (coil) -> explosive easeOut launch -> gravity easeIn fall
//   STAR — 4 keyframes: AE burst curve (barely moves then snaps) -> spring overshoot -> asymmetric settle
//   Both locked to DURATION + REST so they cycle in sync
function AnimatedBadge() {
  const shouldReduceMotion = useReducedMotion()
  if (shouldReduceMotion) return <StaticBadge />

  const DURATION = 1.2 // long enough for easing curves to be perceptible
  const REST = 1.5     // clear pause before each cycle

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
            [0.55, 0, 1, 0.45],    // ease-in: slow compression, coiling
            [0.0, 0.7, 0.3, 1.0],  // ease-out: explosive launch, brakes at peak
            [0.55, 0, 1.0, 0.45],  // ease-in: gravity accelerates into landing
          ],
        }}
        style={{ willChange: 'transform' }}
      />

      {/* STAR: AE burst (creeps then snaps through 360) -> overshoot -> asymmetric settle */}
      <motion.span
        className="text-[#0A84FF] inline-flex flex-shrink-0 leading-none"
        animate={{ rotate: [0, 360, 374, 360] }}
        transition={{
          duration: DURATION,
          repeat: Infinity,
          repeatType: 'loop',
          repeatDelay: REST,
          times: [0, 0.52, 0.72, 1],
          ease: [
            [0.14, 0, 0.21, 1],       // AE burst: 52% of time barely moves, then snaps
            [0.34, 1.56, 0.64, 1],    // spring overshoot to 374deg (action)
            [0.68, -0.6, 0.32, 1.29], // asymmetric springy settle (reaction != action)
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
