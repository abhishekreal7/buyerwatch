/**
 * Reveal — buyerwatch-style scroll entrance via framer-motion (not GSAP).
 *
 * Pattern matches https://buyerwatch.com/: whileInView, opacity + y only, once.
 * Same premium ease curve as the landing page so it does not fight Section/fadeUp.
 * prefers-reduced-motion → render children with no animation.
 */
'use client'

import { type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export type RevealProps = {
  children: ReactNode
  /** Delay before the reveal starts (seconds). */
  delay?: number
  /** Tween duration (seconds). */
  duration?: number
  className?: string
  style?: CSSProperties
}

const easeOutPremium: [number, number, number, number] = [0.16, 1, 0.3, 1]

export function Reveal({
  children,
  delay = 0,
  duration = 0.65,
  className,
  style,
}: RevealProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25, margin: '0px 0px -10% 0px' }}
      transition={{ duration, delay, ease: easeOutPremium }}
    >
      {children}
    </motion.div>
  )
}

export default Reveal
