'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Clock, Workflow, Quote } from 'lucide-react'

// Sleek vector line-art icons for the Orange Metric Showcase Card
const DetectionSpeedIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const IntentScoreIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v18M3 12h18" opacity="0.35" />
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" fill="white" />
  </svg>
)

const DraftTimeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="14" y2="13" />
    <line x1="8" y1="17" x2="12" y2="17" />
  </svg>
)

const ReplyRateIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
)

const features = [
  {
    id: 0,
    icon: Sparkles,
    title: 'Match Detected',
    description: 'Scouto scans Reddit, X, and Bluesky 24/7. When someone describes the exact problem you solve, it flags it.',
    leftTitle: 'TIME TO DETECT',
    leftMetric: '< 9 min',
    leftDescription: 'A post asking for cold email alternatives was detected and flagged in under 9 minutes.',
    metricIcon: DetectionSpeedIcon
  },
  {
    id: 1,
    icon: Clock,
    title: 'Intent Scored',
    description: 'Not just keyword matching. The model reads the post context to verify the user is actually looking to buy.',
    leftTitle: 'BUYING CONFIDENCE',
    leftMetric: '94%',
    leftDescription: 'The classifier scored the lead 94/100, filtering out generic chatter and spam.',
    metricIcon: IntentScoreIcon
  },
  {
    id: 2,
    icon: Workflow,
    title: 'Reply Drafted',
    description: 'A draft is generated instantly using your product details, voice examples, and the specific thread context.',
    leftTitle: 'DRAFT TIME',
    leftMetric: '< 60s',
    leftDescription: 'A customized, helpful reply is drafted immediately without using generic templates.',
    metricIcon: DraftTimeIcon
  },
  {
    id: 3,
    icon: Quote,
    title: 'Approved & Sent',
    description: 'You review the draft, edit anything you want, and post it. Scouto never auto-posts without your click.',
    leftTitle: 'REPLY RATE',
    leftMetric: '18%',
    leftDescription: 'Warm replies to active searchers convert at 18%, compared to less than 1% for cold outreach.',
    metricIcon: ReplyRateIcon
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
          
          {/* Left Column: Premium Showcase Showcase Column (Sticky) */}
          <div className="w-full lg:w-[48%] lg:sticky top-[10vh] flex justify-center">
            <div className="relative w-full max-w-[460px] min-h-[730px] rounded-[28px] overflow-hidden flex flex-col items-center justify-between p-7" style={{
              backgroundColor: '#09090B',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.3)'
            }}>
              {/* Dot matrix background grid */}
              <div className="absolute inset-0 opacity-[0.025] pointer-events-none z-0" style={{
                backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                backgroundSize: '16px 16px'
              }} />
              
              {/* Radial orange glow aura */}
              <div className="absolute inset-0 pointer-events-none z-0" style={{
                background: 'radial-gradient(circle at 50% 50%, rgba(255, 81, 1, 0.12) 0%, transparent 65%)',
                filter: 'blur(40px)'
              }} />

              {/* Orbit track background concentric circular rings */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
                <div className="absolute w-[200px] h-[200px] rounded-full border border-white/[0.04]" />
                <div className="absolute w-[300px] h-[300px] rounded-full border border-dashed border-white/[0.04]" />
                <div className="absolute w-[400px] h-[400px] rounded-full border border-dashed border-[#FF5101]/[0.08]" />
                
                {/* Micro-nodes on the circular rings */}
                <div className="absolute w-[300px] h-[300px] rounded-full pointer-events-none animate-[spin_80s_linear_infinite]">
                  <div className="absolute top-[14.6%] left-[14.6%] w-1.5 h-1.5 rounded-full bg-white/20" />
                  <div className="absolute bottom-[14.6%] right-[14.6%] w-1.5 h-1.5 rounded-full bg-[#FF5101]/30" />
                </div>
              </div>

              {/* Center orange card */}
              <div className="flex-1 flex items-center justify-center w-full relative z-10 my-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`orange-${activeIndex}`}
                    initial={{ y: 12, opacity: 0, scale: 0.95 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -12, opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="w-[240px] h-[270px] rounded-[22px] p-6 flex flex-col items-center justify-center text-center relative z-20 border border-white/20"
                    style={{
                      backgroundColor: '#FF5101',
                      boxShadow: '0 25px 50px -12px rgba(255, 81, 1, 0.38), inset 0 1px 0 rgba(255,255,255,0.3)'
                    }}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center mb-4">
                      {React.createElement(features[activeIndex].metricIcon)}
                    </div>
                    <div className="text-[12px] font-medium tracking-[0.08em] uppercase mb-2 text-white/80" style={{ fontFamily: 'var(--font-inter)' }}>
                      {features[activeIndex].leftTitle}
                    </div>
                    <div className="text-[42px] font-semibold tracking-[-0.03em] leading-none text-white" style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif' }}>
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
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -16, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full max-w-[380px] bg-[#111113]/90 backdrop-blur-xl rounded-[18px] p-5 border border-white/10 shadow-2xl flex items-start gap-4 text-left"
                    style={{ minHeight: '110px' }}
                  >
                    <div className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0 text-white mt-0.5">
                      {React.createElement(features[activeIndex].icon, { className: "w-4 h-4" })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-[14px] font-medium text-white tracking-tight mb-1" style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif' }}>
                        {features[activeIndex].title}
                      </h5>
                      <p className="text-[13px] text-[#A1A1AA] leading-relaxed font-normal" style={{ fontFamily: 'var(--font-inter)' }}>
                        {features[activeIndex].leftDescription}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Right Column: Features list with divider lines and custom accordion layout */}
          <div className="w-full lg:flex-1 flex flex-col border-t border-black/[0.08] pt-4 gap-7">
            {features.map((feature, index) => {
              const isActive = activeIndex === index
              const Icon = feature.icon

              return (
                <div
                  key={feature.id}
                  onClick={() => setActiveIndex(index)}
                  className="group relative pb-7 border-b border-black/[0.08] cursor-pointer text-left transition-colors duration-300"
                >
                  <div className="flex items-start gap-4.5">
                    {/* Circle-wrapped icon wrapper */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                      style={{
                        border: isActive ? '1px solid #FF5101' : '1px solid #E5E7EB',
                        backgroundColor: isActive ? '#FFF4F0' : '#FFFFFF',
                        color: '#FF5101',
                        opacity: isActive ? 1 : 0.45,
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Accordion Text block */}
                    <div className="flex-1 min-w-0">
                      <h4
                        className="transition-colors duration-300"
                        style={{
                          fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                          fontWeight: isActive ? 600 : 500,
                          fontSize: '20px',
                          letterSpacing: '-0.02em',
                          color: isActive ? '#09090B' : '#71717A',
                          lineHeight: '1.25'
                        }}
                      >
                        {feature.title}
                      </h4>

                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.div
                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                            animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <p className="text-[15px] leading-relaxed text-[#52525B] max-w-[540px]" style={{ fontFamily: 'var(--font-inter)' }}>
                              {feature.description}
                            </p>
                            
                            {/* Horizontal Progress bar indicator */}
                            <div className="relative h-[2px] w-[140px] bg-black/10 mt-5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: '0%' }}
                                animate={{ width: '100%' }}
                                key={activeIndex}
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
