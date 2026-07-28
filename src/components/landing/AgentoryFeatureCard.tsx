'use client'

import { motion } from 'framer-motion'

interface AgentoryFeatureCardProps {
  iconType?: 'clock' | 'gears' | 'check'
  label?: string
  metric?: string
  title?: string
  description?: string
}

export function AgentoryFeatureCard({
  iconType = 'gears',
  label = 'MANUAL FRICTION',
  metric = '-85%',
  title = 'Task Automation',
  description = 'Hand off the repetitive grunt work to autonomous agents. BuyerWatch orchestrates complex background workflows, handles multi-app data syncs, and sends automatic progress updates instantly.',
}: AgentoryFeatureCardProps) {
  return (
    <div className="w-full max-w-[380px] h-[520px] rounded-[28px] bg-[#0C0D0E] border border-white/[0.08] p-6 relative overflow-hidden flex flex-col justify-between shadow-[0_24px_60px_rgba(0,0,0,0.6)] font-sans">
      {/* Background Orbital Rings */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-35">
        <svg className="w-full h-full" viewBox="0 0 380 520" fill="none">
          {/* Orbital Circle 1 */}
          <circle cx="190" cy="220" r="140" stroke="#FF5101" strokeWidth="1" strokeDasharray="3 6" opacity="0.4" />
          {/* Orbital Circle 2 */}
          <circle cx="190" cy="220" r="105" stroke="white" strokeWidth="1" strokeDasharray="2 5" opacity="0.25" />
          {/* Orbital Circle 3 */}
          <circle cx="190" cy="220" r="70" stroke="#FF5101" strokeWidth="1" strokeDasharray="4 4" opacity="0.35" />
          
          {/* Orbiting Dots */}
          <circle cx="50" cy="220" r="3.5" fill="#FF5101" />
          <circle cx="295" cy="180" r="3" fill="#8E8E93" />
          <circle cx="130" cy="325" r="2.5" fill="#FF5101" opacity="0.8" />
        </svg>
      </div>

      {/* Center Orange Metric Badge */}
      <div className="flex-1 w-full flex items-center justify-center relative z-10 pt-2">
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-[240px] h-[250px] rounded-[24px] bg-[#FF5101] p-6 flex flex-col items-center justify-center text-center shadow-[0_16px_44px_rgba(255,81,1,0.45)] relative"
        >
          {/* Icon Badge */}
          <div className="mb-4">
            {iconType === 'gears' && (
              <div className="w-14 h-14 relative flex items-center justify-center">
                <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
                  {/* Outer Arrow Circular Path */}
                  <path d="M24 6 C33.9411 6 42 14.0589 42 24 C42 27.5 41 30.8 39.2 33.6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" opacity="0.8" />
                  <path d="M24 42 C14.0589 42 6 33.9411 6 24 C6 20.5 7 17.2 8.8 14.4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" opacity="0.8" />
                  {/* Gear 1 */}
                  <circle cx="20" cy="20" r="7" fill="white" stroke="#1C1816" strokeWidth="2" />
                  <path d="M20 10v3M20 27v3M10 20h3M27 20h3" stroke="#1C1816" strokeWidth="2" strokeLinecap="round" />
                  {/* Gear 2 */}
                  <circle cx="29" cy="29" r="6" fill="white" stroke="#1C1816" strokeWidth="2" />
                  <path d="M29 20v3M29 35v3M20 29h3M35 29h3" stroke="#1C1816" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            )}

            {iconType === 'clock' && (
              <div className="w-11 h-11 rounded-full border border-white/40 bg-white/10 flex items-center justify-center backdrop-blur-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            )}
          </div>

          {/* Uppercase Category Label */}
          <span className="text-white text-[11px] font-extrabold uppercase tracking-[0.12em] mb-1 opacity-90">
            {label}
          </span>

          {/* Massive Metric Value */}
          <span className="text-white text-[50px] font-black leading-none tracking-tight">
            {metric}
          </span>
        </motion.div>
      </div>

      {/* Bottom Description Overlay Container */}
      <div className="w-full rounded-[20px] bg-[#141518]/90 border border-white/[0.08] p-4 flex items-start gap-3.5 backdrop-blur-md z-10 shadow-lg">
        {/* Left Orange Sparkle Icon */}
        <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z"
              stroke="#FF5101"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M4 3V6M2.5 4.5H5.5" stroke="#FF5101" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M4 18V21M2.5 19.5H5.5" stroke="#FF5101" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* Text Details */}
        <div className="flex-1">
          <h4 className="text-white font-bold text-[14px] tracking-tight mb-1">
            {title}
          </h4>
          <p className="text-[#98989E] text-[12px] leading-[1.5] font-normal">
            {description}
          </p>
        </div>
      </div>
    </div>
  )
}
