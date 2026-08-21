'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { sourcePlatforms } from './HomeVisuals'
import { springs } from '@/lib/motion'
import { BrandLogo } from '@/components/BrandLogo'

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
  { date: 'Jan 1, 2025', discovered: 120, qualified: 40 },
  { date: 'Jan 15, 2025', discovered: 240, qualified: 90 },
  { date: 'Feb 1, 2025', discovered: 450, qualified: 180 },
  { date: 'Feb 15, 2025', discovered: 380, qualified: 120 },
  { date: 'Mar 1, 2025', discovered: 550, qualified: 210 },
  { date: 'Mar 15, 2025', discovered: 510, qualified: 190 },
  { date: 'Apr 1, 2025', discovered: 847, qualified: 289 },
  { date: 'Apr 15, 2025', discovered: 680, qualified: 210 },
  { date: 'May 1, 2025', discovered: 620, qualified: 190 },
  { date: 'May 15, 2025', discovered: 790, qualified: 240 }
]

const LeadDiscoveryTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const discovered = payload.find((entry: any) => entry.dataKey === 'discovered')
    const qualified = payload.find((entry: any) => entry.dataKey === 'qualified')
    return (
      <div style={{
        background: '#1C1C1A',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '11px',
        boxShadow: '0 12px 30px rgba(0,0,0,0.16)',
        padding: '10px 12px',
        minWidth: '154px',
        fontFamily: 'var(--font-inter), sans-serif',
      }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: '#A7A7A1', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#D0D0CB', fontWeight: 500 }}>
              <span style={{ width: '12px', height: '2px', borderRadius: '999px', background: '#8A8A84', flexShrink: 0 }} />
              Discovered
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{discovered?.value}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#D0D0CB', fontWeight: 500 }}>
              <span style={{ width: '12px', height: '2px', borderRadius: '999px', background: '#0A84FF', flexShrink: 0 }} />
              High intent
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#62B4FF', fontVariantNumeric: 'tabular-nums' }}>{qualified?.value}</span>
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
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '16px', color: '#1C1C1A', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
            Lead discovery
          </h4>
          <p style={{ marginTop: '4px', fontFamily: 'var(--font-inter), sans-serif', fontSize: '11px', color: '#8A8A84', lineHeight: 1.45 }}>
            Matched conversations over time
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 pt-0.5">
          <span className="rounded-full border border-[#E4E4E1] bg-[#F7F7F5] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A8A84]">
            Example data
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontFamily: 'var(--font-inter), sans-serif', fontSize: '10.5px',
            color: '#777771', fontWeight: 500, whiteSpace: 'nowrap',
          }}>
            <span style={{ width: '14px', height: '2px', borderRadius: '999px', background: '#8A8A84', flexShrink: 0, display: 'inline-block' }} />
            Discovered
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontFamily: 'var(--font-inter), sans-serif', fontSize: '10.5px',
            color: '#777771', fontWeight: 500, whiteSpace: 'nowrap',
          }}>
            <span style={{ width: '14px', height: '2px', borderRadius: '999px', background: '#0A84FF', flexShrink: 0, display: 'inline-block' }} />
            High intent
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart accessibilityLayer data={leadDiscoveryData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorDiscovered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#171717" stopOpacity={0.05} />
                <stop offset="95%" stopColor="#171717" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorQualified" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#0A84FF" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="rgba(20,18,16,0.045)"
              strokeDasharray="3 6"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => (value.includes(' 1,') ? value.slice(0, 3) : '')}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'rgba(20,18,16,0.38)', fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-inter), sans-serif' }}
              interval={0}
              tickMargin={9}
            />
            <YAxis
              domain={[0, 1000]}
              ticks={[0, 500, 1000]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'rgba(20,18,16,0.28)', fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-inter), sans-serif' }}
              tickFormatter={(value) => (value === 1000 ? '1k' : String(value))}
              width={31}
            />
            <Tooltip
              content={<LeadDiscoveryTooltip />}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
              cursor={{ stroke: 'rgba(10,132,255,0.16)', strokeWidth: 1 }}
              wrapperStyle={{ outline: 'none' }}
            />

            <Area
              type="linear"
              dataKey="discovered"
              stroke="#171717"
              strokeWidth={1.75}
              fillOpacity={1}
              fill="url(#colorDiscovered)"
              dot={false}
              activeDot={{ r: 4, fill: '#171717', stroke: '#fff', strokeWidth: 2 }}
            />
            <Area
              type="linear"
              dataKey="qualified"
              stroke="#0A84FF"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorQualified)"
              dot={false}
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

const buyerWatchConversation = [
  {
    side: 'left',
    name: 'Avery in r/SaaS',
    time: '08:14',
    tone: 'reddit',
    text: 'How do you find buyers who are already asking for help? I keep seeing the right Reddit threads too late.',
  },
  {
    side: 'right',
    name: 'BuyerWatch',
    time: '08:16',
    tone: 'buyerwatch',
    text: "I'd say BuyerWatch came from this exact problem, then share one useful search phrase they can try either way.",
  },
  {
    side: 'left',
    name: 'Avery',
    time: '08:19',
    tone: 'appreciation',
    text: "That sounds way less spammy. I'd actually respond to that.",
  },
] as const

export const BuyerWatchAgentPreview = () => {
  const [visibleMessages, setVisibleMessages] = useState(1)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '120px' })

  useEffect(() => {
    if (!inView) return
    const timer = setInterval(() => {
      setVisibleMessages((count) => (count >= buyerWatchConversation.length ? 1 : count + 1))
    }, 1900)
    return () => clearInterval(timer)
  }, [inView])

  return (
    <motion.div
      ref={ref}
      className="flex h-[268px] w-full flex-col justify-end gap-2 overflow-hidden pb-2"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.45 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.14, delayChildren: 0.04 } } }}
    >
      <AnimatePresence mode="popLayout">
        {buyerWatchConversation.slice(0, visibleMessages).map((message, index) => {
          const isReply = message.side === 'right'
          const isAppreciation = message.tone === 'appreciation'

          return (
            <motion.div
              key={message.time}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.96, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, scale: 0.98, filter: 'blur(2px)' }}
              transition={{ duration: 0.42, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className={`${isReply ? 'ml-auto max-w-[84%] text-right' : 'max-w-[88%]'}`}
            >
              <div className={`mb-1.5 flex items-center gap-2 ${isReply ? 'justify-end' : 'justify-start'}`}>
                {!isReply && (
                  <img
                    src="/landing-founder-avatar.png"
                    alt=""
                    className={`h-7 w-7 rounded-full object-cover ${isAppreciation ? 'opacity-95' : ''}`}
                  />
                )}
                {isReply && (
                  <motion.div
                    className="flex h-[22px] w-[22px] items-center justify-center"
                    animate={{ y: [0, -2, 0] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <BrandLogo compact size="sm" />
                  </motion.div>
                )}
                <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontSize: '14px', fontWeight: 800, color: '#1C1C1A', letterSpacing: '-0.025em' }}>
                  {message.name}
                </span>
              </div>
              <motion.div
                className={`inline-block max-w-[310px] rounded-[12px] px-3.5 py-2 text-left text-[12.75px] font-semibold leading-[1.3] tracking-[-0.018em] shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${
                  isReply
                    ? 'rounded-tr-[4px] bg-[#0A84FF] text-white shadow-[0_10px_24px_rgba(10,132,255,0.18)]'
                    : isAppreciation
                      ? 'rounded-tl-[4px] border border-[#E7E7E3] bg-[#F7F7F5] text-[#3F3F3A]'
                      : 'rounded-tl-[4px] bg-[#FFE3D7] text-[#1C1C1A]'
                }`}
                animate={isReply ? { boxShadow: ['0 10px 24px rgba(10,132,255,0.16)', '0 14px 30px rgba(10,132,255,0.24)', '0 10px 24px rgba(10,132,255,0.16)'] } : undefined}
                transition={isReply ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
              >
                {message.text}
              </motion.div>
              <div className="mt-1 text-[10.5px] font-semibold text-[#9B9B96]">{message.time}</div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </motion.div>
  )
}

export const BentoTrafficWidget = () => {
  const trafficSources = [
    { name: 'Reddit', value: 40, color: '#FF5101', track: '#FFF0EA' },
    { name: 'X', value: 80, color: '#1C1C1A', track: '#ECECE9' },
    { name: 'Bluesky', value: 20, color: '#0A84FF', track: '#EAF4FF' },
  ]

  return (
    <div className="relative flex h-full min-h-[280px] w-full flex-col justify-between">
      <div className="z-10 mb-2 flex items-center justify-between">
        <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', color: '#0A0A0A', letterSpacing: '-0.02em' }}>
          Traffic
        </h4>
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-center gap-5 px-1 py-2">
        <div className="pointer-events-none absolute inset-0 flex justify-between px-1 opacity-[0.06]">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-full w-px border-r border-dashed border-[#0A0A0A]" />
          ))}
        </div>

        {trafficSources.map(source => (
          <div key={source.name} className="relative w-full">
            <div
              className="relative flex h-10 w-full items-center overflow-hidden rounded-[12px]"
              style={{ backgroundColor: source.track }}
              role="progressbar"
              aria-label={`${source.name} relative traffic`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={source.value}
            >
              <div
                className="h-full rounded-[12px]"
                style={{ width: `${source.value}%`, backgroundColor: source.color }}
              />
              <span
                className="absolute top-1/2 flex h-6 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-white text-[11px] font-bold tabular-nums text-[#0A0A0A] shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                style={{
                  left: `max(8px, calc(${source.value}% - 52px))`,
                  borderColor: `${source.color}4D`,
                }}
              >
                {source.value}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="z-10 mt-2 flex items-center justify-start gap-8 text-[13px] font-medium" style={{ fontFamily: 'var(--font-inter)' }}>
        {trafficSources.map(source => (
          <div key={source.name} className="flex items-center gap-2 text-[#0A0A0A]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: source.color }} aria-hidden />
            {source.name}
          </div>
        ))}
      </div>
    </div>
  )
}
