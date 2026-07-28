'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface FeatureItem {
  id: string
  icon: 'sparkle' | 'clock' | 'network'
  title: string
  description: string
  orangeBadge: {
    icon: 'calendar' | 'clockCheck' | 'gears'
    label: string
    metric: string
  }
}

const features: FeatureItem[] = [
  {
    id: 'emails',
    icon: 'sparkle',
    title: 'Automated Intent Tracking',
    description: 'Let BuyerWatch scan social signals automatically. From high-intent mentions to competitor alternative requests, leads move forward without bottlenecks.',
    orangeBadge: {
      icon: 'calendar',
      label: 'HOURS RECLAIMED',
      metric: '32 hrs',
    },
  },
  {
    id: 'scheduling',
    icon: 'clock',
    title: 'Effortless Lead Qualification',
    description: 'Skip manual filtering chaos. BuyerWatch AI rates lead intent score, extracts buyer budget signals, and drafts contextual replies in seconds.',
    orangeBadge: {
      icon: 'clockCheck',
      label: 'RESPONSE TIME',
      metric: '< 2 mins',
    },
  },
  {
    id: 'automation',
    icon: 'network',
    title: 'Task Automation',
    description: 'Simplify repetitive sales work. BuyerWatch handles background monitoring, continuous post scoring, and Slack alerts so your team stays focused on closing.',
    orangeBadge: {
      icon: 'gears',
      label: 'MANUAL FRICTION',
      metric: '-85%',
    },
  },
]

export function AgentoryFeatureSection() {
  const [activeIndex, setActiveIndex] = useState(0)

  // Auto cycle features every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % features.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const activeFeature = features[activeIndex]

  return (
    <div className="w-full max-w-[1140px] mx-auto px-6 py-12 font-sans">
      <div className="grid lg:grid-cols-[360px_1fr] gap-12 items-center">
        {/* Left Column: TALL BLACK VERTICAL CARD (Matches Image 2 exactly) */}
        <div className="w-[360px] h-[580px] rounded-[28px] bg-[#0A0B0C] border border-white/[0.08] p-6 relative overflow-hidden flex flex-col justify-between shadow-[0_24px_60px_rgba(0,0,0,0.6)] mx-auto shrink-0">
          {/* Orbital Background Rings with Dots */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
            <svg className="w-full h-full" viewBox="0 0 360 580" fill="none">
              <circle cx="180" cy="240" r="140" stroke="#FF5101" strokeWidth="1" strokeDasharray="3 6" opacity="0.45" />
              <circle cx="180" cy="240" r="105" stroke="white" strokeWidth="1" strokeDasharray="2 5" opacity="0.25" />
              <circle cx="180" cy="240" r="70" stroke="#FF5101" strokeWidth="1" strokeDasharray="4 4" opacity="0.35" />
              
              <circle cx="40" cy="240" r="3.5" fill="#FF5101" />
              <circle cx="285" cy="195" r="3" fill="#8E8E93" />
              <circle cx="120" cy="345" r="2.5" fill="#FF5101" opacity="0.8" />
            </svg>
          </div>

          {/* Center Orange Card */}
          <div className="flex-1 w-full flex items-center justify-center relative z-10 pt-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeFeature.id}
                initial={{ scale: 0.94, opacity: 0, y: 8 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="w-[230px] h-[250px] rounded-[24px] bg-[#FF5101] p-6 flex flex-col items-center justify-center text-center shadow-[0_16px_44px_rgba(255,81,1,0.45)] relative"
              >
                {/* Icon */}
                <div className="mb-4">
                  {activeFeature.orangeBadge.icon === 'calendar' && (
                    <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
                      <rect x="12" y="16" width="40" height="36" rx="6" fill="white" stroke="#1C1816" strokeWidth="2.5" />
                      <line x1="22" y1="12" x2="22" y2="18" stroke="#1C1816" strokeWidth="3" strokeLinecap="round" />
                      <line x1="42" y1="12" x2="42" y2="18" stroke="#1C1816" strokeWidth="3" strokeLinecap="round" />
                      <rect x="18" y="24" width="6" height="6" rx="1.5" fill="#FF8C5A" />
                      <rect x="29" y="24" width="6" height="6" rx="1.5" fill="#FF8C5A" />
                      <rect x="40" y="24" width="6" height="6" rx="1.5" fill="#FF8C5A" />
                      <rect x="18" y="34" width="6" height="6" rx="1.5" fill="#FF8C5A" />
                      <rect x="29" y="34" width="6" height="6" rx="1.5" fill="#FF8C5A" />
                      <g transform="translate(36, 8)">
                        <circle cx="12" cy="12" r="11" fill="#FFA575" stroke="#1C1816" strokeWidth="2" />
                        <path d="M12 7v5l3 3" stroke="#1C1816" strokeWidth="2.5" strokeLinecap="round" />
                      </g>
                      <g transform="translate(34, 34)">
                        <circle cx="12" cy="12" r="11" fill="#EBF3FE" stroke="#1C1816" strokeWidth="2" />
                        <path d="M8 12l3 3 5-6" stroke="#1C1816" strokeWidth="2.5" strokeLinecap="round" />
                      </g>
                    </svg>
                  )}

                  {activeFeature.orangeBadge.icon === 'clockCheck' && (
                    <div className="w-12 h-12 rounded-full border border-white/40 bg-white/10 flex items-center justify-center backdrop-blur-sm">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                  )}

                  {activeFeature.orangeBadge.icon === 'gears' && (
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <circle cx="20" cy="20" r="7" fill="white" stroke="#1C1816" strokeWidth="2" />
                      <path d="M20 10v3M20 27v3M10 20h3M27 20h3" stroke="#1C1816" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="29" cy="29" r="6" fill="white" stroke="#1C1816" strokeWidth="2" />
                      <path d="M29 20v3M29 35v3M20 29h3M35 29h3" stroke="#1C1816" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </div>

                {/* Uppercase Category Label */}
                <span className="text-white text-[11px] font-extrabold uppercase tracking-[0.12em] mb-1 opacity-90">
                  {activeFeature.orangeBadge.label}
                </span>

                {/* Metric */}
                <span className="text-white text-[46px] font-black leading-none tracking-tight">
                  {activeFeature.orangeBadge.metric}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom Dark Overlay Box INSIDE Left Black Card (Matches Image 2) */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFeature.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="w-full rounded-[20px] bg-[#141518]/90 border border-white/[0.08] p-4 flex items-start gap-3.5 backdrop-blur-md z-10 shadow-lg"
            >
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
                  {activeFeature.title}
                </h4>
                <p className="text-[#98989E] text-[12px] leading-[1.5] font-normal line-clamp-2">
                  {activeFeature.description}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Column: Interactive List (Light Background Style) */}
        <div className="flex flex-col gap-6 pl-2">
          {features.map((feat, index) => {
            const isActive = index === activeIndex
            return (
              <div
                key={feat.id}
                onClick={() => setActiveIndex(index)}
                className={`cursor-pointer transition-all duration-300 pb-6 border-b relative ${
                  isActive ? 'border-[#FF5101]' : 'border-black/[0.08] opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-3.5 mb-2">
                  {/* Icon */}
                  <div className="text-[#FF5101] shrink-0">
                    {feat.icon === 'sparkle' && (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5101" strokeWidth="2">
                        <path d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z" />
                      </svg>
                    )}
                    {feat.icon === 'clock' && (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5101" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    )}
                    {feat.icon === 'network' && (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5101" strokeWidth="2">
                        <circle cx="6" cy="6" r="3" />
                        <circle cx="18" cy="18" r="3" />
                        <path d="M8.5 8.5l7 7" />
                      </svg>
                    )}
                  </div>

                  <h3 className={`text-[19px] font-bold tracking-tight ${isActive ? 'text-[#0A0A0A]' : 'text-[#5B6871]'}`}>
                    {feat.title}
                  </h3>
                </div>

                <p className="text-[#5B6871] text-[14px] leading-[1.65] font-normal pl-9">
                  {feat.description}
                </p>

                {/* Active Underline Progress Line */}
                {isActive && (
                  <motion.div
                    className="absolute bottom-0 left-0 h-[2.5px] bg-[#FF5101] rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 5, ease: 'linear' }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
