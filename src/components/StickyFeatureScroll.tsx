'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion'

// 🎨 Vector Illustration 1: Futuristic Radar Target Scope (Automated Intent Tracking)
const RadarTargetScopeIcon = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    {/* Outer Radar Scope Ring */}
    <circle cx="32" cy="32" r="26" fill="white" stroke="#1C1816" strokeWidth="2.5" />
    <circle cx="32" cy="32" r="18" fill="none" stroke="#FF8C5A" strokeWidth="2" strokeDasharray="3 3" />
    <circle cx="32" cy="32" r="10" fill="none" stroke="#1C1816" strokeWidth="1.5" />
    <circle cx="32" cy="32" r="3" fill="#1C1816" />
    
    {/* Crosshairs */}
    <line x1="32" y1="4" x2="32" y2="60" stroke="#1C1816" strokeWidth="2" strokeLinecap="round" />
    <line x1="4" y1="32" x2="60" y2="32" stroke="#1C1816" strokeWidth="2" strokeLinecap="round" />
    
    {/* Radar Sweeping Beam Arc */}
    <path d="M32 32 L48 16 A22 22 0 0 1 54 32 Z" fill="#FFA575" opacity="0.6" />
    
    {/* High-Intent Buyer Signal Pin Badge */}
    <g transform="translate(42, 14)">
      <circle cx="6" cy="6" r="6" fill="#FF5101" stroke="#1C1816" strokeWidth="1.8" />
      <circle cx="6" cy="6" r="2" fill="white" />
    </g>
  </svg>
)

// 🎨 Vector Illustration 2: AI Lead Intent Rating Badge (AI Lead Qualification / 94%)
const AIIntentRatingIcon = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    {/* Shield Base */}
    <path
      d="M32 6 L52 14 V30 C52 44 32 58 32 58 C32 58 12 44 12 30 V14 Z"
      fill="white"
      stroke="#1C1816"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Inner Glowing Core */}
    <path
      d="M32 12 L46 18 V30 C46 40 32 51 32 51 C32 51 18 40 18 30 V18 Z"
      fill="#FFA575"
      opacity="0.85"
      stroke="#1C1816"
      strokeWidth="1.8"
    />
    {/* Sparkle Star in Center */}
    <path
      d="M32 20 C32 25 36 29 41 29 C36 29 32 33 32 38 C32 33 28 29 23 29 C28 29 32 25 32 20 Z"
      fill="white"
      stroke="#1C1816"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
)

// 🎨 Vector Illustration 3: Dual Interlocking Precision Gears (Task Automation)
const PrecisionGearsIcon = () => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
    {/* Main Gear */}
    <g transform="translate(4, 4)">
      <circle cx="20" cy="20" r="13" fill="#FFA575" stroke="#1C1816" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="5" fill="white" stroke="#1C1816" strokeWidth="2" />
      <path d="M20 4v5M20 31v5M4 20h5M31 20h5M8.7 8.7l3.5 3.5M27.8 27.8l3.5 3.5M8.7 31.3l3.5-3.5M27.8 12.2l3.5-3.5" stroke="#1C1816" strokeWidth="2.5" strokeLinecap="round" />
    </g>
    {/* Secondary Interlocking Gear */}
    <g transform="translate(26, 26)">
      <circle cx="14" cy="14" r="9" fill="white" stroke="#1C1816" strokeWidth="2.5" />
      <circle cx="14" cy="14" r="3.5" fill="#FFA575" stroke="#1C1816" strokeWidth="1.8" />
      <path d="M14 3v3M14 22v3M3 14h3M22 14h3" stroke="#1C1816" strokeWidth="2" strokeLinecap="round" />
    </g>
  </svg>
)

// Feature Item List Icons
const SparkleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z"
      stroke="#FF5101"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M4 3V6M2.5 4.5H5.5" stroke="#FF5101" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 18V21M2.5 19.5H5.5" stroke="#FF5101" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const ClockIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5101" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const NetworkIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5101" strokeWidth="2">
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="18" r="3" />
    <path d="M8.5 8.5l7 7" strokeLinecap="round" />
  </svg>
)

const features = [
  {
    id: 0,
    listIcon: SparkleIcon,
    title: 'Automated Intent Tracking',
    description: 'Let BuyerWatch scan social signals automatically. From high-intent mentions to competitor alternative requests, leads move forward without bottlenecks.',
    leftTitle: 'Automated Tracking',
    leftMetric: '24/7',
    leftDescription: 'BuyerWatch scans 24/7 in the background across Reddit and Bluesky.',
    metricIcon: RadarTargetScopeIcon,
  },
  {
    id: 1,
    listIcon: ClockIcon,
    title: 'AI Lead Qualification',
    description: 'Skip manual filtering chaos. BuyerWatch AI rates lead intent score (0-100), extracts buyer budget signals, and drafts contextual replies in seconds.',
    leftTitle: 'AI Intent Score',
    leftMetric: '94%',
    leftDescription: 'AI scoring engine filters noise and flags high-intent buyers instantly.',
    metricIcon: AIIntentRatingIcon,
  },
  {
    id: 2,
    listIcon: NetworkIcon,
    title: 'Task Automation',
    description: 'Simplify repetitive sales work. BuyerWatch handles background thread monitoring, continuous post scoring, and Slack alerts so your team stays focused on closing.',
    leftTitle: 'Manual Friction',
    leftMetric: '-85%',
    leftDescription: 'Autonomous workers handle multi-platform scraping and reply drafting.',
    metricIcon: PrecisionGearsIcon,
  },
]

export const StickyFeatureScroll = () => {
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const inView = useInView(sectionRef, { margin: '160px' })
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (!inView || paused || shouldReduceMotion) return
    const timer = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % features.length)
    }, 5000)
    return () => clearTimeout(timer)
  }, [activeIndex, inView, paused, shouldReduceMotion])

  const activeFeature = features[activeIndex]

  return (
    <section
      ref={sectionRef}
      id="features"
      className="relative w-full py-20"
      style={{ backgroundColor: '#FFFFFF' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-[1140px] mx-auto px-6 font-sans">
        {/* Flexbox Row Layout (Black Card LEFT, Text RIGHT) */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '48px', width: '100%' }}>
          
          {/* Left Column: TALL BLACK VERTICAL CARD WINDOW */}
          <div
            className="relative overflow-hidden flex flex-col justify-between p-6 shrink-0"
            style={{
              width: '360px',
              minWidth: '360px',
              height: '560px',
              borderRadius: '28px',
              backgroundColor: '#121315',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
              flexShrink: 0,
            }}
          >
            {/* Orbital Rings Background */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-25">
              <svg className="w-full h-full" viewBox="0 0 360 560" fill="none">
                <circle cx="180" cy="230" r="140" stroke="#FF5101" strokeWidth="1" strokeDasharray="3 6" opacity="0.45" />
                <circle cx="180" cy="230" r="105" stroke="white" strokeWidth="1" strokeDasharray="2 5" opacity="0.25" />
                <circle cx="180" cy="230" r="70" stroke="#FF5101" strokeWidth="1" strokeDasharray="4 4" opacity="0.35" />
                <circle cx="40" cy="230" r="3.5" fill="#FF5101" />
                <circle cx="285" cy="185" r="3" fill="#8E8E93" />
                <circle cx="120" cy="340" r="2.5" fill="#FF5101" opacity="0.8" />
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
                  className="p-6 flex flex-col items-center justify-center text-center relative"
                  style={{
                    width: '230px',
                    height: '250px',
                    borderRadius: '24px',
                    backgroundColor: '#FF5101',
                    boxShadow: '0 16px 44px rgba(255, 81, 1, 0.4)',
                  }}
                >
                  {/* Vector Illustration */}
                  <div className="mb-4 flex items-center justify-center">
                    {React.createElement(activeFeature.metricIcon)}
                  </div>

                  {/* Title Case Label */}
                  <span style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', opacity: 1, fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em', marginBottom: '4px', display: 'block' }}>
                    {activeFeature.leftTitle}
                  </span>

                  {/* Metric Value */}
                  <span style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', opacity: 1, fontSize: '48px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', display: 'block', whiteSpace: 'nowrap' }}>
                    {activeFeature.leftMetric}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom Dark Overlay Box INSIDE Left Black Card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeFeature.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className="w-full p-4 flex items-start gap-3.5 z-10"
                style={{
                  borderRadius: '20px',
                  backgroundColor: '#1C1E22',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                }}
              >
                {/* Left Orange Sparkle Icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <SparkleIcon />
                </div>

                {/* Text Details */}
                <div className="flex-1">
                  <h4 style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', opacity: 1, fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em', marginBottom: '4px', marginTop: 0, display: 'block' }}>
                    {activeFeature.title}
                  </h4>
                  <p style={{ color: '#E0E0E5', WebkitTextFillColor: '#E0E0E5', opacity: 1, fontSize: '12px', lineHeight: '1.5', fontWeight: 400, margin: 0, display: 'block' }}>
                    {activeFeature.leftDescription}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right Column: Interactive Feature List */}
          <div className="flex flex-col gap-6" style={{ flex: 1, minWidth: 0 }}>
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
                    <div className="text-[#FF5101] shrink-0">
                      {React.createElement(feat.listIcon)}
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
    </section>
  )
}
