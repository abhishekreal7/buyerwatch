'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, ChevronRight, Send, Sparkles } from 'lucide-react'
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
  { date: 'Week 1', discovered: 214, qualified: 48 },
  { date: 'Week 2', discovered: 286, qualified: 72 },
  { date: 'Week 3', discovered: 271, qualified: 67 },
  { date: 'Week 4', discovered: 354, qualified: 104 },
  { date: 'Week 5', discovered: 411, qualified: 126 },
  { date: 'Week 6', discovered: 386, qualified: 118 },
  { date: 'Week 7', discovered: 472, qualified: 153 },
  { date: 'Week 8', discovered: 438, qualified: 141 },
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
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 750, fontSize: '16px', color: '#15191D', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
            Lead discovery
          </h4>
          <p style={{ marginTop: '4px', fontFamily: 'var(--font-inter), sans-serif', fontSize: '11px', color: '#7D8790', lineHeight: 1.45 }}>
            Qualified conversations over the selected period
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2 pt-0.5">
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontFamily: 'var(--font-inter), sans-serif', fontSize: '10.5px',
            color: '#66717B', fontWeight: 550, whiteSpace: 'nowrap',
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: '#20262C', flexShrink: 0, display: 'inline-block' }} />
            Discovered
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontFamily: 'var(--font-inter), sans-serif', fontSize: '10.5px',
            color: '#66717B', fontWeight: 550, whiteSpace: 'nowrap',
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: '#0A84FF', flexShrink: 0, display: 'inline-block' }} />
            High intent
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[228px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart accessibilityLayer data={leadDiscoveryData} margin={{ top: 14, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorDiscovered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#20262C" stopOpacity={0.11} />
                <stop offset="90%" stopColor="#20262C" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="colorQualified" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.24} />
                <stop offset="92%" stopColor="#0A84FF" stopOpacity={0.015} />
              </linearGradient>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="rgba(27,35,43,0.07)"
              strokeDasharray="2 7"
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'rgba(38,49,59,0.48)', fontSize: 10, fontWeight: 550, fontFamily: 'var(--font-inter), sans-serif' }}
              interval={1}
              tickMargin={9}
            />
            <YAxis
              domain={[0, 500]}
              ticks={[0, 250, 500]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'rgba(38,49,59,0.35)', fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-inter), sans-serif' }}
              width={31}
            />
            <Tooltip
              content={<LeadDiscoveryTooltip />}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
              cursor={{ stroke: 'rgba(10,132,255,0.16)', strokeWidth: 1 }}
              wrapperStyle={{ outline: 'none' }}
            />

            <Area
              type="monotone"
              dataKey="discovered"
              stroke="#20262C"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorDiscovered)"
              dot={false}
              activeDot={{ r: 4, fill: '#20262C', stroke: '#fff', strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="qualified"
              stroke="#0A84FF"
              strokeWidth={2.75}
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

const contextFailures = [
  {
    index: '01',
    title: 'Generic pitch delivered',
    detail: 'No active buying context',
    outcome: 'Ignored',
    tone: 'danger',
  },
  {
    index: '02',
    title: 'Manual feed search',
    detail: '47 minutes across 6 communities',
    outcome: 'Low signal',
    tone: 'neutral',
  },
  {
    index: '03',
    title: 'Relevant thread discovered',
    detail: 'Conversation already moved on',
    outcome: 'Missed',
    tone: 'danger',
  },
] as const

export function ContextGapVisual() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0b0f14] p-5 text-white shadow-[0_30px_80px_rgba(24,35,45,0.18)] sm:p-7">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:radial-gradient(rgba(255,255,255,0.32)_0.7px,transparent_0.7px)] [background-size:17px_17px]"
      />
      <div className="relative flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7f8a95]">Traditional outreach</div>
          <div className="mt-1 text-[15px] font-bold tracking-[-0.025em] text-[#f3f5f6]">Context gap detected</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ff665a]/20 bg-[#ff665a]/[0.09] px-2.5 py-1 text-[9px] font-bold text-[#ff8a82]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff665a]" />
          Low relevance
        </span>
      </div>

      <div className="relative mt-5 space-y-2.5">
        {contextFailures.map((item, index) => (
          <motion.div
            key={item.index}
            className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.035] px-3 py-3"
            initial={{ opacity: 0, x: 12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.12 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.05] text-[9px] font-bold text-[#a8b1ba]">
              {item.index}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold tracking-[-0.01em] text-[#e8ecef]">{item.title}</span>
              <span className="mt-0.5 block truncate text-[9px] font-medium text-[#808b96]">{item.detail}</span>
            </span>
            <span className={`rounded-full px-2 py-1 text-[8px] font-bold ${item.tone === 'danger' ? 'bg-[#ff665a]/[0.09] text-[#ff8a82]' : 'bg-white/[0.06] text-[#a8b1ba]'}`}>
              {item.outcome}
            </span>
          </motion.div>
        ))}
      </div>

      <div className="relative mt-5 grid grid-cols-3 divide-x divide-white/[0.08] border-t border-white/[0.08] pt-4 text-center">
        <div>
          <div className="text-[16px] font-extrabold tracking-[-0.035em] text-white">73%</div>
          <div className="mt-0.5 text-[8px] font-semibold text-[#7f8a95]">ignored</div>
        </div>
        <div>
          <div className="text-[16px] font-extrabold tracking-[-0.035em] text-white">47m</div>
          <div className="mt-0.5 text-[8px] font-semibold text-[#7f8a95]">manual search</div>
        </div>
        <div>
          <div className="text-[16px] font-extrabold tracking-[-0.035em] text-[#ff8a82]">0</div>
          <div className="mt-0.5 text-[8px] font-semibold text-[#7f8a95]">timely signals</div>
        </div>
      </div>
    </div>
  )
}

const workflowSteps = [
  {
    key: 'monitor',
    number: '01',
    label: 'Monitor',
    title: 'Define high-signal rules',
    description: 'Track pain points, competitor names, and buying language across the communities that matter.',
  },
  {
    key: 'score',
    number: '02',
    label: 'Score',
    title: 'Qualify the conversation',
    description: 'BuyerWatch ranks intent from the thread context and your product profile before it reaches the queue.',
  },
  {
    key: 'draft',
    number: '03',
    label: 'Draft',
    title: 'Build a contextual reply',
    description: 'Generate a useful, on-tone response grounded in the source conversation and community rules.',
  },
  {
    key: 'approve',
    number: '04',
    label: 'Approve',
    title: 'Review and deliver',
    description: 'Keep human approval by default, or use guarded automation when the account and policy checks allow it.',
  },
] as const

type WorkflowStepKey = (typeof workflowSteps)[number]['key']

function WorkflowPreview({ step }: { step: WorkflowStepKey }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        className="flex h-full flex-col"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        {step === 'monitor' ? (
          <>
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#7f8a95]">Monitoring rules</div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0ea86b]/10 px-2 py-1 text-[8px] font-bold text-[#55dda5]"><span className="h-1.5 w-1.5 rounded-full bg-[#35d89a]" />Live</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {['alternative to', 'need recommendations', 'switching from', 'best tool for'].map((keyword, index) => (
                <motion.span
                  key={keyword}
                  className={`rounded-full border px-3 py-2 text-[10px] font-semibold ${index === 0 ? 'border-[#0a84ff]/35 bg-[#0a84ff]/15 text-[#75baff]' : 'border-white/[0.09] bg-white/[0.04] text-[#a6b0b9]'}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.07 }}
                >
                  “{keyword}”
                </motion.span>
              ))}
            </div>
            <div className="mt-auto grid grid-cols-3 gap-2">
              {['Reddit', 'X', 'Bluesky'].map((platform, index) => (
                <div key={platform} className="rounded-[12px] border border-white/[0.08] bg-white/[0.035] p-3">
                  <div className="flex items-center justify-between text-[9px] font-semibold text-[#dce2e7]"><span>{platform}</span><span className="h-1.5 w-1.5 rounded-full bg-[#35d89a]" /></div>
                  <div className="mt-2 text-[8px] text-[#73808b]">{[6, 4, 3][index]} rules active</div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {step === 'score' ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.13em] text-[#7f8a95]"><span>Intent analysis</span><span>r/SaaS</span></div>
            <div className="my-auto grid grid-cols-[112px_minmax(0,1fr)] items-center gap-6">
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-[#35d89a]/25 bg-[#35d89a]/[0.07] shadow-[0_0_45px_rgba(53,216,154,0.08)]">
                <div className="absolute inset-2 rounded-full border border-[#35d89a]/15" />
                <div className="text-center"><div className="text-[33px] font-extrabold tracking-[-0.05em] text-[#6ee7b7]">94</div><div className="text-[7px] font-bold uppercase tracking-[0.11em] text-[#718079]">Buying intent</div></div>
              </div>
              <div className="space-y-2">
                {['Actively seeking a solution', 'Pain point matches profile', 'Recent and replyable'].map((reason) => (
                  <div key={reason} className="flex items-center gap-2 rounded-[10px] border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-[9px] font-medium text-[#b2bbc3]"><Check className="h-3 w-3 text-[#35d89a]" />{reason}</div>
                ))}
              </div>
            </div>
            <div className="rounded-[11px] border border-[#35d89a]/15 bg-[#35d89a]/[0.06] px-3 py-2 text-[9px] font-semibold text-[#77dcb5]">Qualified for reply review</div>
          </div>
        ) : null}

        {step === 'draft' ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.13em] text-[#7f8a95]"><span>Contextual draft</span><span className="text-[#75baff]">Ready</span></div>
            <div className="mt-5 rounded-[14px] border border-white/[0.08] bg-white/[0.035] p-3">
              <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#6f7b86]">Source thread</div>
              <p className="mt-1.5 text-[10px] font-medium leading-[1.5] text-[#c7ced4]">What are people using to catch high-intent posts before the conversation moves on?</p>
            </div>
            <div className="mt-3 flex-1 rounded-[14px] border border-[#0a84ff]/25 bg-[#0a84ff]/[0.08] p-4 shadow-[0_12px_30px_rgba(10,132,255,0.06)]">
              <div className="mb-2 flex items-center gap-2 text-[8px] font-bold uppercase tracking-[0.1em] text-[#75baff]"><Sparkles className="h-3 w-3" />Suggested reply</div>
              <p className="text-[10px] font-medium leading-[1.55] text-[#dce7f2]">Start with a focused set of communities, then qualify each mention by buying language before deciding whether to reply.</p>
              <div className="mt-4 flex gap-2"><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[8px] text-[#8d99a4]">Tone matched</span><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[8px] text-[#8d99a4]">Rules checked</span></div>
            </div>
          </div>
        ) : null}

        {step === 'approve' ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.13em] text-[#7f8a95]"><span>Delivery review</span><span>Manual approval</span></div>
            <div className="my-auto space-y-2.5">
              {['Community policy verified', 'Duplicate protection armed', 'Account connection healthy'].map((check) => (
                <div key={check} className="flex items-center justify-between rounded-[12px] border border-white/[0.08] bg-white/[0.035] px-3.5 py-3 text-[10px] font-medium text-[#c6cdd3]"><span>{check}</span><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#35d89a]/10"><Check className="h-3 w-3 text-[#55dda5]" /></span></div>
              ))}
            </div>
            <button type="button" className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-white px-4 py-3 text-[10px] font-bold text-[#11161a] shadow-[0_10px_30px_rgba(255,255,255,0.08)]">
              Approve and send <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  )
}

export function WorkflowShowcase() {
  const [activeStep, setActiveStep] = useState<WorkflowStepKey>('monitor')
  const activeIndex = workflowSteps.findIndex((step) => step.key === activeStep)
  const selectedStep = workflowSteps[activeIndex]

  return (
    <div className="grid overflow-hidden rounded-[30px] border border-[#dfe4e8] bg-white shadow-[0_30px_80px_rgba(31,43,54,0.1)] lg:grid-cols-[0.9fr_1.1fr]">
      <div className="flex flex-col border-b border-[#e4e8eb] bg-[#f6f8f9] p-5 sm:p-7 lg:border-b-0 lg:border-r">
        <div className="mb-5 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.13em] text-[#8b959e]"><span>BuyerWatch workflow</span><span>{activeIndex + 1} / 4</span></div>
        <div className="space-y-2">
          {workflowSteps.map((step) => {
            const isActive = step.key === activeStep
            return (
              <button
                key={step.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveStep(step.key)}
                className={`w-full rounded-[16px] border px-4 py-3.5 text-left transition-all duration-200 ${isActive ? 'border-[#0a84ff]/25 bg-white shadow-[0_10px_26px_rgba(31,50,69,0.08)]' : 'border-transparent hover:border-[#dfe4e8] hover:bg-white/70'}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[9px] font-bold ${isActive ? 'bg-[#0a84ff] text-white' : 'bg-[#e8ecef] text-[#7c8791]'}`}>{step.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[9px] font-bold uppercase tracking-[0.1em] ${isActive ? 'text-[#0a84ff]' : 'text-[#8a949d]'}`}>{step.label}</span>
                    <span className="mt-0.5 block text-[12px] font-bold tracking-[-0.018em] text-[#20262c]">{step.title}</span>
                  </span>
                  <ChevronRight className={`h-4 w-4 transition-transform ${isActive ? 'translate-x-0.5 text-[#0a84ff]' : 'text-[#a5adb4]'}`} />
                </div>
              </button>
            )
          })}
        </div>
        <p className="mt-5 min-h-[42px] text-[11px] font-medium leading-[1.55] text-[#6c7781]">{selectedStep.description}</p>
      </div>

      <div className="relative min-h-[380px] overflow-hidden bg-[#0b0f14] p-5 text-white sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:radial-gradient(rgba(255,255,255,0.3)_0.7px,transparent_0.7px)] [background-size:17px_17px]" />
        <div className="relative h-full"><WorkflowPreview step={activeStep} /></div>
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
                <span className="font-[var(--font-jakarta)] text-[14px] font-extrabold tracking-[-0.025em] text-[#1C1C1A]">
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
