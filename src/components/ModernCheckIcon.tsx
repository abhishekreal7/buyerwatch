'use client'

import React from 'react'
import { motion } from 'framer-motion'

interface IconProps {
  size?: number
  className?: string
  animated?: boolean
  onClick?: () => void
}

/**
 * Option 1: Linear / Raycast Style — Sleek Gradient Ring with Animated SVG Draw Check
 * Warm cream backdrop, glowing orange gradient ring, and precision check path.
 */
export function GradientRingCheckIcon({
  size = 40,
  className = '',
  animated = true,
  onClick,
}: IconProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`relative inline-flex items-center justify-center rounded-full transition-all focus:outline-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="orangeRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF5101" />
            <stop offset="100%" stopColor="#FF7A00" />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#FF5101" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Soft Cream Background Circle */}
        <circle cx="18" cy="18" r="17" fill="#FFF7F2" stroke="#FFEAE0" strokeWidth="1" />

        {/* Outer Glowing Orange Gradient Circle */}
        <motion.circle
          cx="18"
          cy="18"
          r="12.5"
          stroke="url(#orangeRingGrad)"
          strokeWidth="2.2"
          filter="url(#softGlow)"
          initial={animated ? { pathLength: 0 } : false}
          animate={animated ? { pathLength: 1 } : false}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />

        {/* Precision Checkmark */}
        <motion.path
          d="M12.5 18.2L16 21.7L23.5 14.2"
          stroke="url(#orangeRingGrad)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animated ? { pathLength: 0, opacity: 0 } : false}
          animate={animated ? { pathLength: 1, opacity: 1 } : false}
          transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
        />
      </svg>
    </motion.button>
  )
}

/**
 * Option 2: Apple / Stripe Style — Solid Premium Badge with White Check
 * Vibrant solid orange core with subtle inner ring highlight and crisp white vector checkmark.
 */
export function SolidBadgeCheckIcon({
  size = 40,
  className = '',
  animated = true,
  onClick,
}: IconProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.06, y: -1 }}
      whileTap={{ scale: 0.94 }}
      className={`relative inline-flex items-center justify-center rounded-full transition-all focus:outline-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-[0_4px_12px_rgba(255,81,1,0.3)]"
      >
        <defs>
          <linearGradient id="solidOrangeBadge" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FF6018" />
            <stop offset="100%" stopColor="#E64400" />
          </linearGradient>
        </defs>

        {/* Ambient Ring Aura */}
        <circle cx="18" cy="18" r="17" fill="#FFF4ED" />

        {/* Solid Badge Core */}
        <circle cx="18" cy="18" r="13" fill="url(#solidOrangeBadge)" />
        <circle cx="18" cy="18" r="12.5" stroke="white" strokeOpacity="0.25" strokeWidth="1" />

        {/* Crisp White Checkmark */}
        <motion.path
          d="M12.8 18.4L16.2 21.8L23.2 14.8"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animated ? { pathLength: 0, opacity: 0 } : false}
          animate={animated ? { pathLength: 1, opacity: 1 } : false}
          transition={{ duration: 0.35, delay: 0.1, ease: 'easeOut' }}
        />
      </svg>
    </motion.button>
  )
}

/**
 * Option 3: Modern Tech / AI Radar Style — Double Orbital Rings with Sparkle Accent
 * Concentric animated rings with glowing center check for high-tech SaaS dashboards.
 */
export function RadarOrbitalCheckIcon({
  size = 40,
  className = '',
  animated = true,
  onClick,
}: IconProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      className={`relative inline-flex items-center justify-center rounded-full transition-all focus:outline-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soft background fill */}
        <circle cx="18" cy="18" r="17" fill="#FAFAFA" stroke="#F0F0ED" strokeWidth="1" />

        {/* Pulsing Orbit Track */}
        <motion.circle
          cx="18"
          cy="18"
          r="14"
          stroke="#FF5101"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity={0.4}
          animate={animated ? { rotate: 360 } : false}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '18px 18px' }}
        />

        {/* Inner Solid Circle */}
        <circle cx="18" cy="18" r="10.5" fill="#FFF3EC" stroke="#FF5101" strokeWidth="1.8" />

        {/* Checkmark */}
        <motion.path
          d="M13.5 18.2L16.5 21.2L22.5 15.2"
          stroke="#FF5101"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animated ? { pathLength: 0 } : false}
          animate={animated ? { pathLength: 1 } : false}
          transition={{ duration: 0.4, delay: 0.2 }}
        />

        {/* AI Sparkle Dot */}
        <motion.circle
          cx="24.5"
          cy="11.5"
          r="1.8"
          fill="#FF5101"
          animate={animated ? { scale: [0.8, 1.4, 0.8], opacity: [0.6, 1, 0.6] } : false}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </svg>
    </motion.button>
  )
}
