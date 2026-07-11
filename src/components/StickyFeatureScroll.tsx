'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Clock, Workflow, Quote } from 'lucide-react'

// Custom high-fidelity vector icons for the Orange Metric Showcase Card
const HandDiamondIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {/* Diamond shape */}
    <path d="M12 3 L19 8 L12 16 L5 8 Z" fill="rgba(255,255,255,0.2)" />
    <path d="M12 3v13M5 8h14" />
    {/* Hand supporting diamond */}
    <path d="M2 17h6c1.1 0 2 .9 2 2v2" />
    <path d="M10 18c2 0 3-3.5 6-3.5s2 1.5 2 3v2c0 1.1-.9 2-2 2h-6" />
    {/* Sparkle */}
    <path d="M20.5 4l.5.8.5-.8-.5-.8z" fill="white" stroke="none" />
  </svg>
)

const ClockCalendarIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" fill="rgba(255,255,255,0.2)" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <circle cx="12" cy="15" r="3.5" fill="rgba(255,255,255,0.3)" />
    <polyline points="12 13.5 12 15 13.5 15" />
  </svg>
)

const WorkflowIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="6" height="6" rx="1.5" fill="rgba(255,255,255,0.2)" />
    <rect x="15" y="3" width="6" height="6" rx="1.5" />
    <rect x="9" y="15" width="6" height="6" rx="1.5" fill="rgba(255,255,255,0.2)" />
    <path d="M6 9v3a1 1 0 0 0 1 1h2M18 9v3a1 1 0 0 1-1 1h-2M12 15v-2" />
  </svg>
)

const DocumentSparkleIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {/* Document outline */}
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" fill="rgba(255,255,255,0.2)" />
    <polyline points="14 2 14 7 20 7" />
    {/* Text lines */}
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="8" y1="16" x2="16" y2="16" />
    {/* Sparkle star at top-right */}
    <path d="M20 3.5l.8.8.8-.8-.8-.8z" fill="white" stroke="none" />
    <path d="M21.6 4.3l-.8-.8.8-.8.8.8z" fill="white" stroke="none" />
  </svg>
)

const features = [
  {
    id: 0,
    icon: Sparkles,
    title: 'Automated Emails',
    description: 'Let AgenAi manage your inbox. From smart replies to timely follow-ups, emails move forward automatically without bottlenecks.',
    leftTitle: 'Response Speed',
    leftMetric: '10x',
    leftDescription: 'Let AgenAi autonomously manage your inbox. By accurately analyzing intent, generating smart, context-aware replies, and triggering timely follow-ups, your communication moves forward without bottlenecks.',
    metricIcon: HandDiamondIcon
  },
  {
    id: 1,
    icon: Clock,
    title: 'Effortless Scheduling',
    description: 'Skip calendar chaos. AgenAi finds the perfect time, coordinates multi-party invites, and dynamically adapts to last-minute changes so meetings stay on track.',
    leftTitle: 'Hours Reclaimed',
    leftMetric: '32 hrs',
    leftDescription: 'Skip calendar chaos. AgenAi finds the perfect time, coordinates multi-party invites, and dynamically adapts to last-minute changes so meetings stay on track.',
    metricIcon: ClockCalendarIcon
  },
  {
    id: 2,
    icon: Workflow,
    title: 'Task Automation',
    description: 'Simplify repetitive work. AgenAi handles background reminders, continuous progress updates, and complex data handoffs between your favorite tools so your team can focus on growth.',
    leftTitle: 'Manual Friction',
    leftMetric: '-85%',
    leftDescription: 'Simplify repetitive work. AgenAi handles background reminders, continuous progress updates, and complex data handoffs between your favorite tools so your team can focus on growth.',
    metricIcon: WorkflowIcon
  },
  {
    id: 3,
    icon: Quote,
    title: 'Smart Summaries',
    description: 'Extract clarity from noise. AgenAi instantly condenses lengthy email threads, dense documents, and meeting transcripts into actionable next steps and executive overviews.',
    leftTitle: 'Time-to-Insight',
    leftMetric: '< 5s',
    leftDescription: 'Cut through the noise and extract instant clarity. AgenAi condenses long email threads, heavy documentation, and long transcripts into crisp, executive-level action items in seconds.',
    metricIcon: DocumentSparkleIcon
  }
]

export const StickyFeatureScroll = () => {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % features.length)
    }, 6000)
    return () => clearTimeout(timer)
  }, [activeIndex])

  return (
    <section id="features" className="relative w-full py-28" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-[62px] items-start">
          
          {/* Left Column: Premium Mockup Showcase Column (Sticky) */}
          <div className="w-full lg:w-[48%] lg:sticky top-[10vh] flex justify-center">
            <div className="relative w-full max-w-[460px] min-h-[757px] rounded-[28px] overflow-hidden flex flex-col items-center justify-between p-7" style={{
              backgroundColor: '#000000',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.3)'
            }}>
              {/* Dot matrix background grid */}
              <div className="absolute inset-0 opacity-[0.02] pointer-events-none z-0" style={{
                backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                backgroundSize: '16px 16px'
              }} />
              
              {/* Radial orange glow aura */}
              <div className="absolute inset-0 pointer-events-none z-0" style={{
                background: 'radial-gradient(circle at 50% 55%, rgba(255, 81, 1, 0.12) 0%, transparent 65%)',
                filter: 'blur(35px)'
              }} />

              {/* Orbit track background concentric circular rings */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
                <div className="absolute w-[200px] h-[200px] rounded-full border border-white/[0.03]" />
                <div className="absolute w-[300px] h-[300px] rounded-full border border-dashed border-white/[0.03]" />
                <div className="absolute w-[400px] h-[400px] rounded-full border border-dashed border-[#FF5101]/[0.06]" />
                <div className="absolute w-[520px] h-[520px] rounded-full border border-white/[0.015]" />
                <div className="absolute w-[350px] h-[350px] rounded-full border border-[#FF5101]/[0.04]" />
                
                {/* Micro-nodes on the circular rings */}
                <div className="absolute w-[300px] h-[300px] rounded-full pointer-events-none animate-[spin_80s_linear_infinite]">
                  <div className="absolute top-[14.6%] left-[14.6%] w-1.5 h-1.5 rounded-full bg-white/20" />
                  <div className="absolute bottom-[14.6%] right-[14.6%] w-1.5 h-1.5 rounded-full bg-[#FF5101]/30" />
                </div>
                <div className="absolute w-[400px] h-[400px] rounded-full pointer-events-none animate-[spin_120s_linear_infinite_reverse]">
                  <div className="absolute top-[50%] right-[-3px] -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/10" />
                  <div className="absolute top-[8.5%] left-[25%] w-1.5 h-1.5 rounded-full bg-[#FF5101]/25" />
                </div>
              </div>

              {/* Center orange card */}
              <div className="flex-1 flex items-center justify-center w-full relative z-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`orange-${activeIndex}`}
                    initial={{ y: 15, opacity: 0, scale: 0.94 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -15, opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="w-[260px] h-[300px] rounded-[24px] p-8 flex flex-col items-center justify-center text-center relative z-20"
                    style={{
                      backgroundColor: '#FF5101',
                      boxShadow: '0 30px 60px rgba(255, 81, 1, 0.35), inset 0 1.5px 0 rgba(255,255,255,0.25)'
                    }}
                  >
                    <div className="w-14 h-14 rounded-[14px] bg-white/15 flex items-center justify-center mb-5">
                      {React.createElement(features[activeIndex].metricIcon)}
                    </div>
                    <div className="text-[11px] font-bold tracking-[0.14em] uppercase mb-2" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                      {features[activeIndex].leftTitle}
                    </div>
                    <div className="text-[48px] font-black tracking-tight leading-none" style={{ color: '#FFFFFF' }}>
                      {features[activeIndex].leftMetric}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Dark bottom overlapping detail card */}
              <div className="w-full flex justify-center relative z-20">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`dark-${activeIndex}`}
                    initial={{ y: 25, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -25, opacity: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full max-w-[360px] bg-black/70 backdrop-blur-md rounded-[20px] p-6 border border-white/[0.08] flex gap-4"
                    style={{ minHeight: '130px' }}
                  >
                    <div className="w-9 h-9 rounded-full bg-[#FF5101]/15 border border-[#FF5101]/25 flex items-center justify-center flex-shrink-0 text-[#FF5101]">
                      {React.createElement(features[activeIndex].icon, { className: "w-4.5 h-4.5" })}
                    </div>
                    <div className="flex-1 flex flex-col justify-center text-left">
                      <h5 className="text-[14px] font-bold mb-1" style={{ color: '#FFFFFF' }}>
                        {features[activeIndex].title}
                      </h5>
                      <p className="text-[12px] leading-relaxed" style={{ color: '#A0A0A0' }}>
                        {features[activeIndex].leftDescription}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Right Column: Features list with divider lines and custom accordion layout */}
          <div className="w-full lg:flex-1 flex flex-col border-t border-black/[0.08] pt-4 gap-8">
            {features.map((feature, index) => {
              const isActive = activeIndex === index
              const Icon = feature.icon

              return (
                <div
                  key={feature.id}
                  onClick={() => setActiveIndex(index)}
                  className="group relative pb-8 border-b border-black/[0.08] cursor-pointer text-left transition-colors duration-300"
                >
                  <div className="flex items-start gap-5">
                    {/* Circle-wrapped icon wrapper */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                      style={{
                        border: isActive ? '1px solid rgba(255, 81, 1, 0.5)' : '1px solid rgba(0, 0, 0, 0.1)',
                        color: '#FF5101',
                        opacity: isActive ? 1 : 0.4,
                      }}
                    >
                      <Icon className="w-4.5 h-4.5" />
                    </div>

                    {/* Accordion Text block */}
                    <div className="flex-1 min-w-0">
                      <h4
                        className="font-bold transition-colors duration-300"
                        style={{
                          fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                          fontSize: '24px',
                          letterSpacing: '-0.02em',
                          color: isActive ? '#000000' : '#808080',
                          lineHeight: '1.2'
                        }}
                      >
                        {feature.title}
                      </h4>

                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.div
                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                            animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <p className="text-[16px] leading-relaxed text-[#4B5563] max-w-[540px]">
                              {feature.description}
                            </p>
                            
                            {/* Horizontal Progress bar indicator */}
                            <div className="relative h-[2px] w-[140px] bg-black/10 mt-6 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: '0%' }}
                                animate={{ width: '100%' }}
                                key={activeIndex} // restarts transition on tab switch
                                transition={{ duration: 6, ease: 'linear' }}
                                className="absolute left-0 top-0 h-full bg-[#FF5101]"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
