'use client'

import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export default function EyebrowBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#0A84FF]/[0.08] border border-[#0A84FF]/20 shadow-[0_2px_12px_rgba(10,132,255,0.12)] mb-8"
    >
      <motion.span
        animate={{ scale: [1, 1.25, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="w-2 h-2 rounded-full bg-[#0A84FF] shadow-[0_0_8px_#0A84FF]"
        aria-hidden="true"
      />
      <motion.div
        animate={{ rotate: [0, 15, -15, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles className="w-3.5 h-3.5 text-[#0A84FF]" />
      </motion.div>
      <span className="text-sm font-semibold text-[#0A84FF] tracking-tight">
        Stop waiting for inbound leads
      </span>
    </motion.div>
  )
}
