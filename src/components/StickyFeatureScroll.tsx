'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { Radar, PenTool, LayoutDashboard } from 'lucide-react'

const features = [
  { id: 0, icon: Radar, accentColor: '#0A84FF', title: '24/7 Intent Monitoring', description: 'Scouto continuously scans Reddit & Bluesky to find high-intent conversations where people are actively asking for your solution.', metric: '< 5s', metricLabel: 'Time-to-Signal', stat: '12,400+', statLabel: 'Subreddits Scanned' },
  { id: 1, icon: PenTool, accentColor: '#0085FF', title: 'AI-Drafted Authentic Replies', description: 'Skip the blank page. Our AI drafts personalized replies that sound exactly like you, using your established voice and tone.', metric: '94%', metricLabel: 'Intent Accuracy', stat: '30s', statLabel: 'Draft Time' },
  { id: 2, icon: LayoutDashboard, accentColor: '#10B981', title: 'Frictionless Publishing', description: 'Review, edit, and publish your approved replies directly from one unified dashboard. No tab-switching required.', metric: '-85%', metricLabel: 'Time Saved', stat: '1-Click', statLabel: 'Approval Flow' },
]

const WidgetCard = ({ feature }: { feature: typeof features[0] }) => {
  const Icon = feature.icon
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 55%, ${feature.accentColor}14 0%, transparent 65%)` }} />
      <motion.div
        initial={{ y: 10, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-[240px] rounded-[22px] p-7 flex flex-col items-center justify-center text-white text-center"
        style={{ backgroundColor: feature.accentColor, boxShadow: `0 24px 64px ${feature.accentColor}55, 0 4px 20px rgba(0,0,0,0.3)` }}
      >
        <div className="w-16 h-16 rounded-[16px] bg-white/20 flex items-center justify-center mb-5">
          <Icon className="w-8 h-8 text-white" strokeWidth={1.6} />
        </div>
        <div className="text-white/70 text-[11px] font-bold tracking-[0.14em] uppercase mb-2">{feature.metricLabel}</div>
        <div className="text-[46px] font-black tracking-tight leading-none">{feature.metric}</div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
        className="absolute bottom-0 left-0 right-0 border-t border-white/[0.07] px-6 py-5 flex items-center gap-3"
      >
        <div className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${feature.accentColor}22`, border: `1px solid ${feature.accentColor}33` }}>
          <Icon className="w-4 h-4" style={{ color: feature.accentColor }} strokeWidth={2} />
        </div>
        <div>
          <div className="text-white/40 text-[10px] font-semibold tracking-[0.1em] uppercase leading-none mb-1">{feature.statLabel}</div>
          <div className="text-white text-[15px] font-bold leading-none">{feature.stat}</div>
        </div>
      </motion.div>
    </div>
  )
}

const FeatureItem = ({ feature, index, activeIndex, setActiveIndex }: { feature: typeof features[0]; index: number; activeIndex: number; setActiveIndex: (i: number) => void }) => {
  const ref = useRef<HTMLDivElement>(null)
  const isActive = activeIndex === index
  const inView = useInView(ref, { margin: '-40% 0px -40% 0px' })
  const Icon = feature.icon
  useEffect(() => { if (inView) setActiveIndex(index) }, [inView, index, setActiveIndex])
  return (
    <div ref={ref} className="py-9 transition-all duration-500 ease-out cursor-pointer" style={{ opacity: isActive ? 1 : 0.35 }} onClick={() => setActiveIndex(index)}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-500" style={{ backgroundColor: isActive ? `${feature.accentColor}18` : 'rgba(0,0,0,0.04)', border: isActive ? `1px solid ${feature.accentColor}30` : '1px solid rgba(0,0,0,0.06)' }}>
          <Icon className="w-5 h-5 transition-all duration-500" style={{ color: isActive ? feature.accentColor : 'rgba(0,0,0,0.3)' }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold mb-2.5 leading-snug transition-colors duration-500" style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontSize: '18px', letterSpacing: '-0.025em', color: isActive ? '#0A0A0A' : 'rgba(0,0,0,0.3)' }}>{feature.title}</h3>
          <p className="leading-relaxed transition-colors duration-500" style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: '14.5px', lineHeight: 1.7, maxWidth: '420px', color: isActive ? '#6B6B6B' : 'rgba(0,0,0,0.2)' }}>{feature.description}</p>
        </div>
      </div>
    </div>
  )
}

export const StickyFeatureScroll = () => {
  const [activeIndex, setActiveIndex] = useState(0)
  return (
    <section id="features" className="relative w-full py-28" style={{ backgroundColor: '#f5f5f7' }}>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <h2 className="mb-5 leading-[1.05]" style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(36px, 4.5vw, 56px)', letterSpacing: '-0.04em', color: '#0A0A0A' }}>
            Built for founders who<br />
            <span style={{ color: 'rgba(0,0,0,0.28)' }}>don&apos;t want to waste time</span>
          </h2>
          <p className="leading-relaxed" style={{ fontFamily: 'var(--font-inter)', fontSize: '16px', color: '#6B6B6B', maxWidth: '420px', margin: '0 auto' }}>
            Every part of Scouto is designed to eliminate manual work and get you in front of warm leads faster.
          </p>
        </div>
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-20 items-start">
          <div className="w-full lg:w-[44%] lg:sticky top-[16vh]">
            <div className="relative rounded-[28px] overflow-hidden" style={{ backgroundColor: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', height: '560px', boxShadow: '0 40px 80px -20px rgba(0,0,0,0.3), 0 8px 32px rgba(0,0,0,0.12)' }}>
              <AnimatePresence mode="wait">
                <motion.div key={activeIndex} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0">
                  <WidgetCard feature={features[activeIndex]} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <div className="w-full lg:w-[56%] flex flex-col divide-y pb-[20vh]" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }} />
            {features.map((feature, index) => (
              <React.Fragment key={feature.id}>
                <FeatureItem feature={feature} index={index} activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
                {index < features.length - 1 && <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.07)' }} />}
              </React.Fragment>
            ))}
            <div style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }} />
          </div>
        </div>
      </div>
    </section>
  )
}
