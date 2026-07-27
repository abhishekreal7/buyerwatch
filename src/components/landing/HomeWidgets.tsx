'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { sourcePlatforms } from './HomeVisuals'
import { springs } from '@/lib/motion'

export const RetryStackAlertCycler = () => {
  const alerts = [
    { title: 'Exponential Retry Backoff', status: '5s → 10s → 20s', color: '#EF4444' },
    { title: 'API Timeout Caught', status: 'Retry Scheduled', color: '#F59E0B' },
    { title: 'Failed Job Recorded', status: 'Visible for Review', color: '#0A84FF' }
  ]
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '120px' })

  useEffect(() => {
    if (!inView) return
    const timer = setInterval(() => {
      setIdx((prev) => (prev + 1) % alerts.length)
    }, 2600)
    return () => clearInterval(timer)
  }, [inView, alerts.length])

  return (
    <div ref={ref} className="my-auto relative h-[88px] flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full bg-white rounded-[16px] p-4 border border-black/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.06)] flex items-center gap-3.5 relative z-10"
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${alerts[idx].color}15`, color: alerts[idx].color }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-[#8E8E93]" style={{ fontFamily: 'var(--font-inter)' }}>
              {alerts[idx].title}
            </div>
            <div className="text-[13px] font-bold text-[#1C1C1E]">
              {alerts[idx].status}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="absolute top-2.5 inset-x-3 h-full bg-white/60 rounded-[16px] border border-black/[0.04] -z-10 transform scale-95" />
    </div>
  )
}
export const ChatSimulation = () => {
  const [messages, setMessages] = useState<number[]>([0])
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '120px' })

  useEffect(() => {
    if (!inView) return
    const timer = setInterval(() => {
      setMessages(prev => {
        if (prev.length >= 3) return [0]
        return [...prev, prev.length]
      })
    }, 2800)
    return () => clearInterval(timer)
  }, [inView])

  const content = [
    { text: "Found a high-intent match on r/SaaS", time: "08:14" },
    { text: "Drafted reply for 'looking for alternatives'", time: "08:15" },
    { text: "Score: 94/100 (Buying Intent)", time: "08:15" }
  ]

  return (
    <div ref={ref} className="flex flex-col gap-3 min-h-[160px] justify-end w-full mb-6 relative z-10">
      <AnimatePresence mode="popLayout">
        {messages.map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={springs.snappy}
            className="bg-surface border border-black/[0.06] rounded-[16px] rounded-tl-[8px] p-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)] self-start max-w-[92%]"
          >
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: '#1C1C1E', fontWeight: 500, marginBottom: '2px', lineHeight: 1.4 }}>
              {content[i].text}
            </div>
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', color: '#ADADAD', fontWeight: 600 }}>
              {content[i].time}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

const leadDiscoveryData = [
  { name: 'Jan', discovered: 120, qualified: 40 },
  { name: 'Jan-mid', discovered: 240, qualified: 90 },
  { name: 'Feb', discovered: 450, qualified: 180 },
  { name: 'Feb-mid', discovered: 380, qualified: 120 },
  { name: 'Mar', discovered: 550, qualified: 210 },
  { name: 'Mar-mid', discovered: 510, qualified: 190 },
  { name: 'Apr', discovered: 847, qualified: 289 },
  { name: 'Apr-mid', discovered: 680, qualified: 210 },
  { name: 'May', discovered: 620, qualified: 190 },
  { name: 'May-mid', discovered: 790, qualified: 240 }
]

const LeadDiscoveryTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const cleanLabel = label.split('-')[0] + ' 2025'
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: '14px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
        padding: '12px 16px',
        minWidth: '168px',
        fontFamily: 'var(--font-inter), sans-serif',
      }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0A0A0A', marginBottom: '10px', letterSpacing: '-0.01em' }}>
          {cleanLabel}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9B9B9B', fontWeight: 500 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0A84FF', flexShrink: 0 }} />
              Threads Found
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0A84FF' }}>{payload[0]?.value}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9B9B9B', fontWeight: 500 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0A84FF', flexShrink: 0 }} />
              High-Intent
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0A84FF' }}>{payload[1]?.value}</span>
          </div>
        </div>
      </div>
    )
  }
  return null
}

export const LeadDiscoveryWidget = () => {
  return (
    <div className="w-full h-full flex flex-col justify-between">
      {/* Header row: title + legend */}
      <div className="flex items-center justify-between mb-4">
        <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', color: '#0A0A0A', letterSpacing: '-0.02em' }}>
          Lead Discovery
        </h4>
        {/* Legend pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontFamily: 'var(--font-inter), sans-serif', fontSize: '12px',
            color: '#9B9B9B', fontWeight: 500,
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0A84FF', flexShrink: 0, display: 'inline-block' }} />
            Threads Found
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontFamily: 'var(--font-inter), sans-serif', fontSize: '12px',
            color: '#9B9B9B', fontWeight: 500,
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0A84FF', flexShrink: 0, display: 'inline-block' }} />
            High-Intent
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={leadDiscoveryData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <defs>
              {/* Primary series area fill */}
              <linearGradient id="colorDiscovered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#0A84FF" stopOpacity={0.0} />
              </linearGradient>
              {/* Secondary: #0A84FF blue, 10% → 0% */}
              <linearGradient id="colorQualified" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.10} />
                <stop offset="95%" stopColor="#0A84FF" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            {/* No gridlines — clean design-system spec */}
            <XAxis
              dataKey="name"
              tickFormatter={(tick) => (tick.includes('-') ? '' : tick)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#9B9B9B', fontSize: 12, fontFamily: 'var(--font-inter), sans-serif' }}
            />
            <YAxis
              ticks={[0, 250, 500, 1000]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#9B9B9B', fontSize: 12, fontFamily: 'var(--font-inter), sans-serif' }}
            />
            <Tooltip content={<LeadDiscoveryTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.06)', strokeWidth: 1 }} />

            {/* Primary series — Threads Found */}
            <Area
              type="monotone"
              dataKey="discovered"
              stroke="#0A84FF"
              strokeWidth={2}
              fill="url(#colorDiscovered)"
              activeDot={{ r: 5, fill: '#0A84FF', stroke: '#fff', strokeWidth: 2 }}
            />
            {/* Secondary series — High-Intent Matches — #0A84FF blue (intentional) */}
            <Area
              type="monotone"
              dataKey="qualified"
              stroke="#0A84FF"
              strokeWidth={2}
              fill="url(#colorQualified)"
              activeDot={{ r: 5, fill: '#0A84FF', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export const BentoPlatformSourcesWidget = () => {
  return (
    <div className="flex flex-col gap-3 w-full px-1">
      {sourcePlatforms.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="w-full flex items-center justify-between p-3.5 rounded-[16px] border border-black/[0.03] bg-[#F8F8F8] shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:border-black/[0.06] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]" style={{ backgroundColor: p.bg }}>
              <p.Icon />
            </div>
            <div className="flex flex-col text-left">
              <span style={{ fontFamily: 'var(--font-jakarta), sans-serif', fontSize: '13px', fontWeight: 700, color: '#0A0A0A', letterSpacing: '-0.01em' }}>{p.name}</span>
              <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: '11px', color: '#6B6B6B' }}>{p.sub}</span>
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontSize: '12px', fontWeight: 700, color: '#0A0A0A' }}>
            {p.count} matches
          </span>
        </motion.div>
      ))}
    </div>
  )
}

export const BentoTrafficWidget = () => {
  return (
    <div className="w-full h-full flex flex-col justify-between relative min-h-[290px] p-5 rounded-2xl backdrop-blur-xl bg-white/70 border border-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Top Header Row with Glass Badges */}
      <div className="flex items-center justify-between z-10 w-full mb-4">
        {/* LIVE Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A84FF] text-white text-[11px] font-bold tracking-wide shadow-[0_2px_8px_rgba(10,132,255,0.35)]">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
          LIVE
        </div>

        {/* Matches Badge */}
        <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#1F1F1F] text-white text-[12px] font-semibold tracking-tight shadow-sm">
          <span>12 matches</span>
        </div>
      </div>

      {/* SVG Smooth Curve Graph Area */}
      <div className="flex-1 relative w-full h-[150px] flex items-center justify-center">
        {/* Background Subtle Gradient Grid */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A84FF]/[0.03] to-transparent rounded-xl pointer-events-none" />

        <svg viewBox="0 0 400 120" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="lineGlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0A84FF" />
              <stop offset="50%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#0A84FF" />
            </linearGradient>
            <linearGradient id="areaGlow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0A84FF" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0A84FF" stopOpacity="0" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Area Fill Under Curve */}
          <path
            d="M 10 90 Q 60 50, 110 75 T 210 25 T 310 80 T 390 55 L 390 120 L 10 120 Z"
            fill="url(#areaGlow)"
          />

          {/* Main Glowing Smooth Curve Line */}
          <motion.path
            d="M 10 90 Q 60 50, 110 75 T 210 25 T 310 80 T 390 55"
            fill="none"
            stroke="url(#lineGlow)"
            strokeWidth="3.5"
            strokeLinecap="round"
            filter="url(#glow)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.8, ease: 'easeInOut' }}
          />

          {/* Active Highlight Dot on Peak */}
          <g transform="translate(210, 25)">
            <circle r="7" fill="white" className="shadow-md" />
            <circle r="4" fill="#FF5101" />
            <circle r="9" fill="none" stroke="#FF5101" strokeWidth="1.5" opacity="0.6">
              <animate attributeName="r" values="6;13;6" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>
        </svg>
      </div>

      {/* Bottom Platform Axis Labels */}
      <div className="flex items-center justify-between w-full pt-3 px-2 border-t border-black/[0.05] text-[10px] font-extrabold text-[#8E8E93] tracking-widest uppercase">
        <span>REDDIT</span>
        <span>BLUESKY</span>
        <span>QUALIFIED</span>
      </div>
    </div>
  )
}
