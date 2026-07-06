'use client'

import { motion } from 'framer-motion'

export function Sparkline({ path, color, className = '' }: { path: string, color: string, className?: string }) {
  return (
    <svg 
      className={`overflow-visible ${className}`}
      viewBox="0 0 100 30" 
      preserveAspectRatio="none"
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <motion.path
        d={path}
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.5 }}
        transition={{ duration: 1.5, ease: [0.32, 0.72, 0, 1], delay: 0.2 }}
      />
    </svg>
  )
}
