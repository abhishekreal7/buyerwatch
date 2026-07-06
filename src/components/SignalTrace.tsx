'use client'

import { motion } from 'framer-motion'

export function SignalTrace({ color, active = false }: { color: string, active?: boolean }) {
  const bars = [0.3, 0.5, 0.2, 0.8, 1, 0.4, 0.2, 0.6, 0.3]
  
  return (
    <div className="flex items-center gap-[2px] h-[16px] opacity-50">
      {bars.map((scale, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full"
          style={{ backgroundColor: color, height: `${scale * 100}%` }}
          animate={active ? {
            height: [`${scale * 100}%`, `${Math.max(0.1, scale - 0.3) * 100}%`, `${scale * 100}%`]
          } : {}}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.1
          }}
        />
      ))}
    </div>
  )
}
