'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { Radar, PenTool, LayoutDashboard } from 'lucide-react'

// ─── FEATURE DATA ──────────────────────────────────────────────────────────
const features = [
  {
    id: 0,
    icon: Radar,
    accentColor: '#FF6B35',
    title: '24/7 Intent Monitoring',
    description: 'Scouto continuously scans Reddit & Bluesky to find high-intent conversations where people are actively asking for your solution.',
    metric: '< 5s',
    metricLabel: 'Time-to-Signal',
    stat: '12,400+',
    statLabel: 'Subreddits Scanned',
  },
  {
    id: 1,
    icon: PenTool,
    accentColor: '#0085FF',
    title: 'AI-Drafted Authentic Replies',
    description: 'Skip the blank page. Our AI drafts personalized replies that sound exactly like you, using your established voice and tone.',
    metric: '94%',
    metricLabel: 'Intent Accuracy',
    stat: '30s',
    statLabel: 'Draft Time',
  },
  {
    id: 2,
    icon: LayoutDashboard,
    accentColor: '#10B981',
    title: 'Frictionless Publishing',
    description: 'Review, edit, and publish your approved replies directly from one unified dashboard. No tab-switching required.',
    metric: '-85%',
    metricLabel: 'Time Saved',
    stat: '1-Click',
    statLabel: 'Approval Flow',
  },
]

// ─── WIDGET CARD (left sticky visual) ─────────────────────────────────────
const WidgetCard = ({ feature }: { feature: typeof features[0] }) => {
  const Icon = feature.icon
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
      {/* Accent widget */}
      <motion.div
        initial={{ y: 10, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-[210px] rounded-[20px] p-6 flex flex-col items-center justify-center text-white text-center shadow-2xl"
        style={{ backgroundColor: feature.accentColor }}
      >
        <div className="w-14 h-14 rounded-[14px] bg-white/20 flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-white" strokeWidth={1.8} />
        </div>
        <div className="text-white/70 text-xs font-semibold tracking-[0.12em] uppercase mb-1">
          {feature.metricLabel}
        </div>
        <div className="text-4xl font-black tracking-tight">
          {feature.metric}
        </div>
      </motion.div>

      {/* Bottom label strip */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
        className="absolute bottom-0 left-0 right-0 border-t border-white/[0.08] px-6 py-4 flex items-center gap-3"
      >
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${feature.accentColor}22` }}
        >
          <Icon className="w-4 h-4" style={{ color: feature.accentColor }} strokeWidth={2} />
        </div>
        <div>
          <div className="text-white/40 text-[10px] font-semibold tracking-[0.1em] uppercase leading-none mb-0.5">
            {feature.statLabel}
          </div>
          <div className="text-white/80 text-sm font-bold leading-none">{feature.stat}</div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── RIGHT-SIDE FEATURE ITEM ───────────────────────────────────────────────
const FeatureItem = ({
  feature,
  index,
  activeIndex,
  setActiveIndex,
}: {
  feature: typeof features[0]
  index: number
  activeIndex: number
  setActiveIndex: (i: number) => void
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const isActive = activeIndex === index
  const inView = useInView(ref, { margin: '-40% 0px -40% 0px' })
  const Icon = feature.icon

  useEffect(() => {
    if (inView) setActiveIndex(index)
  }, [inView, index, setActiveIndex])

  return (
    <div
      ref={ref}
      className={`py-8 transition-all duration-500 ease-out cursor-pointer`}
      style={{ opacity: isActive ? 1 : 0.35 }}
      onClick={() => setActiveIndex(index)}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-500"
          style={{
            backgroundColor: isActive ? `${feature.accentColor}22` : 'rgba(255,255,255,0.05)',
          }}
        >
          <Icon
            className="w-5 h-5 transition-all duration-500"
            style={{ color: isActive ? feature.accentColor : 'rgba(255,255,255,0.4)' }}
            strokeWidth={1.8}
          />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <h3
            className="text-lg font-bold mb-2 transition-colors duration-500 leading-snug"
            style={{ color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)' }}
          >
            {feature.title}
          </h3>
          <p
            className="text-sm leading-relaxed transition-colors duration-500 max-w-md"
            style={{ color: isActive ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)' }}
          >
            {feature.description}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN EXPORT ───────────────────────────────────────────────────────────
export const StickyFeatureScroll = () => {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <section
      className="relative w-full py-28"
      style={{ backgroundColor: '#0d0d0d' }}
    >
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">

        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-20">
          <h2
            className="text-4xl md:text-5xl font-black text-white mb-5 leading-[1.05] tracking-tight"
            style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif' }}
          >
            Built for founders who<br />
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>don&apos;t want to waste time</span>
          </h2>
          <p className="text-[rgba(255,255,255,0.45)] text-lg leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
            Every part of Scouto is designed to eliminate manual work and get you in front of warm leads faster.
          </p>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-20 items-start">

          {/* LEFT — Sticky visual */}
          <div className="w-full lg:w-[44%] lg:sticky top-[16vh]">
            <div
              className="relative rounded-[24px] border overflow-hidden"
              style={{
                backgroundColor: '#171717',
                borderColor: 'rgba(255,255,255,0.08)',
                height: '480px',
                boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6)',
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeIndex}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0"
                >
                  <WidgetCard feature={features[activeIndex]} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT — Scrollable features */}
          <div className="w-full lg:w-[56%] flex flex-col divide-y pb-[20vh]" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
            {features.map((feature, index) => (
              <React.Fragment key={feature.id}>
                <FeatureItem
                  feature={feature}
                  index={index}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                />
                {index < features.length - 1 && (
                  <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.07)' }} />
                )}
              </React.Fragment>
            ))}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }} />
          </div>

        </div>
      </div>
    </section>
  )
}
