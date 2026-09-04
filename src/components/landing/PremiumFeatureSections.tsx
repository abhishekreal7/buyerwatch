'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from 'framer-motion'
import {
  Bell,
  ChevronRight,
  Filter,
  MousePointerClick,
  Search,
} from 'lucide-react'
import { PremiumCtaButton } from '@/components/landing/PremiumCtaButton'

const entrance = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as const },
  },
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
}

function FeaturePill() {
  return (
    <div className="inline-flex items-center rounded-full border border-[#d9e0e5] bg-[#edf1f4] px-4 py-2 text-[12px] font-semibold tracking-[-0.01em] text-[#1d252c]">
      Core intelligence
    </div>
  )
}

function IntentFilterVisual() {
  const signals = ['switching from', 'recommendations', 'best tool', 'alternative to']

  return (
    <div className="relative flex min-h-[205px] flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-x-0 top-5 h-32 bg-[radial-gradient(circle_at_center,rgba(10,132,255,0.14),transparent_68%)]" />
      <div className="relative mb-7 flex h-[112px] w-[112px] items-center justify-center">
        <motion.div
          aria-hidden="true"
          className="absolute h-[104px] w-[104px] rounded-full border border-[#0a84ff]/15 bg-[#0a84ff]/[0.06]"
          animate={{ scale: [0.9, 1.16, 0.9], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[22px] border border-white/70 bg-[linear-gradient(145deg,#2095ff_0%,#0879ea_55%,#0069d7_100%)] shadow-[0_18px_35px_rgba(10,132,255,0.28),inset_0_1px_0_rgba(255,255,255,0.65),inset_0_-8px_18px_rgba(0,51,121,0.18)]"
          animate={{ y: [-4, 5, -4], rotateX: [0, 4, 0], rotateY: [0, -5, 0] }}
          transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformPerspective: 600 }}
        >
          <Filter className="h-9 w-9 text-white" strokeWidth={1.7} />
          <span className="absolute inset-x-3 top-2 h-px bg-white/40" />
        </motion.div>
      </div>

      <div className="relative w-[calc(100%+56px)] overflow-hidden py-2">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#edf1f4] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#edf1f4] to-transparent" />
        <motion.div
          className="flex w-max gap-2"
          animate={{ x: [0, -350] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        >
          {[...signals, ...signals].map((signal, index) => (
            <span
              key={`${signal}-${index}`}
              className="rounded-full border border-black/[0.05] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#39434b] shadow-[0_3px_9px_rgba(30,41,59,0.06)]"
            >
              “{signal}”
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

function CommunityRadarVisual() {
  return (
    <div className="mt-5 overflow-hidden rounded-[14px] border border-black/[0.08] bg-white px-4 pb-3 pt-4 shadow-[0_12px_32px_rgba(31,35,38,0.06)] sm:px-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center bg-[#111] text-white" aria-hidden="true">
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
              <path d="M2 11.5 5.2 8.3l2 1.8 3.1-4.2L14 7.2" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-[var(--font-jakarta)] text-[13px] font-semibold tracking-[-0.025em] text-[#171717]">Intent activity</span>
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/35">7 days</span>
      </div>

      <div className="mt-3 h-[165px] w-full" role="img" aria-label="Seven-day intent activity with Wednesday highlighted at 18 qualified signals">
        <svg viewBox="0 0 340 165" className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="communityFocus" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff5a1f" stopOpacity="0.72" />
              <stop offset="100%" stopColor="#ff5a1f" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {[54, 88, 122].map((y) => (
            <line key={y} x1="8" y1={y} x2="332" y2={y} stroke="#d9dcdf" strokeWidth="1" strokeDasharray="3 4" />
          ))}

          <rect x="104" y="34" width="38" height="99" rx="5" fill="url(#communityFocus)" />

          <motion.path
            d="M14 90 L48 92 L62 108 L91 73 L123 73 L158 110 L194 110 L228 110 L267 75 L300 126 L328 126"
            fill="none"
            stroke="#151515"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
          />

          {[
            [28, 92],
            [123, 73],
            [194, 110],
            [228, 110],
            [300, 126],
          ].map(([cx, cy], index) => (
            <motion.circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r="3.8"
              fill="#151515"
              stroke="#fff"
              strokeWidth="1.2"
              initial={{ opacity: 0, scale: 0 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.36 + index * 0.08, duration: 0.25 }}
            />
          ))}

          <circle cx="123" cy="73" r="4.2" fill="#151515" stroke="#fff" strokeWidth="1.4" />

          <g transform="translate(104 5)">
            <rect width="38" height="24" rx="12" fill="#ff5a1f" />
            <path d="M17 24h5l-2.5 5z" fill="#ff5a1f" />
            <text x="19" y="16" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700">18</text>
          </g>

          <line x1="8" y1="145" x2="332" y2="145" stroke="#d7dadd" strokeWidth="1" />
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
            <text
              key={day}
              x={15 + index * 51.5}
              y="160"
              textAnchor="middle"
              fill={day === 'Wed' ? '#151515' : '#8a8f94'}
              fontSize="9"
              fontWeight={day === 'Wed' ? '700' : '500'}
            >
              {day}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

function IntentDecisionVisual() {
  const decisions = [
    { word: 'BUYING', color: '#ff6a1a' },
    { word: 'COMPARING', color: '#58a7ff' },
    { word: 'READY', color: '#ff7b34' },
  ]
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '100px' })

  useEffect(() => {
    if (!inView) return
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % decisions.length)
    }, 2600)
    return () => window.clearInterval(timer)
  }, [inView, decisions.length])

  const decision = decisions[active]

  return (
    <div ref={ref} className="relative flex min-h-[230px] items-center justify-center overflow-hidden py-9">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,81,1,0.08),transparent_55%)]" />
      <AnimatePresence mode="wait">
        <motion.div
          key={decision.word}
          className="relative flex flex-col items-center"
          initial={{ opacity: 0, y: 16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.96 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="text-center text-[clamp(38px,4vw,58px)] font-black leading-none tracking-[-0.055em]"
            style={{ color: decision.color, textShadow: `0 0 35px ${decision.color}45` }}
          >
            {decision.word}
          </div>
          <div
            aria-hidden="true"
            className="mt-1 text-center text-[clamp(38px,4vw,58px)] font-black leading-none tracking-[-0.055em] opacity-[0.16]"
            style={{
              color: decision.color,
              transform: 'scaleY(-1)',
              maskImage: 'linear-gradient(to bottom, black, transparent 72%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 72%)',
            }}
          >
            {decision.word}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function OpportunityWorkspaceVisual() {
  return (
    <div className="relative mt-5 min-h-[245px] overflow-hidden">
      <div className="absolute left-1/2 top-20 h-64 w-64 -translate-x-1/2 rounded-full border border-[#0a84ff]/20" />
      <div className="absolute left-1/2 top-[130px] h-24 w-24 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#aadaff_22%,#0a84ff_65%,#0457a9_100%)] shadow-[0_24px_45px_rgba(10,132,255,0.3),inset_-10px_-14px_25px_rgba(0,42,104,0.32)]" />

      <div className="absolute bottom-[-16px] left-[8%] w-[235px] rotate-[-7deg] rounded-[18px] border border-white/80 bg-white p-4 shadow-[0_22px_55px_rgba(38,86,117,0.2)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffebe1] text-[#ff5101]">
              <Search className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#17212a]">Looking to switch</p>
              <p className="text-[9px] text-[#7b8791]">r/SaaS · 2m ago</p>
            </div>
          </div>
          <span className="rounded-full bg-[#e9f4ff] px-2 py-1 text-[9px] font-bold text-[#0879ea]">92 intent</span>
        </div>
        <div className="h-2 w-[88%] rounded-full bg-[#e7edf1]" />
        <div className="mt-2 h-2 w-[62%] rounded-full bg-[#edf1f4]" />
      </div>

      <div className="absolute bottom-[-24px] right-[7%] w-[250px] rotate-[8deg] rounded-[18px] border border-white/80 bg-white p-4 shadow-[0_22px_55px_rgba(38,86,117,0.22)]">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7f3ff] text-[#0a84ff]">
            <MousePointerClick className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#17212a]">Draft ready for review</p>
            <p className="text-[9px] text-[#7b8791]">Product-aware response</p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-[#0a84ff] px-3 py-1 text-[9px] font-bold text-white">Review</span>
          <span className="rounded-full bg-[#edf1f4] px-3 py-1 text-[9px] font-semibold text-[#56636d]">Open thread</span>
        </div>
      </div>
    </div>
  )
}

const alerts = [
  { source: 'Reddit', title: 'Competitor alternative requested', score: '94 intent', color: '#ff5101' },
  { source: 'Bluesky', title: 'Buyer comparing workflow tools', score: '88 intent', color: '#0a84ff' },
  { source: 'Reddit', title: 'Draft approved and ready', score: 'Send', color: '#ff5101' },
]

function BuyerAlertVisual() {
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '100px' })

  useEffect(() => {
    if (!inView) return
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % alerts.length)
    }, 2800)
    return () => window.clearInterval(timer)
  }, [inView])

  return (
    <div ref={ref} className="relative flex min-h-[135px] items-center justify-center">
      <div className="absolute h-[74px] w-[78%] translate-y-4 rounded-[16px] border border-black/[0.04] bg-white/45" />
      <div className="absolute h-[74px] w-[88%] translate-y-2 rounded-[16px] border border-black/[0.05] bg-white/70 shadow-[0_10px_25px_rgba(31,41,55,0.06)]" />
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          className="relative z-10 flex w-full items-center gap-3 rounded-[16px] border border-white bg-white p-3 shadow-[0_14px_34px_rgba(35,48,58,0.13)]"
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 13, scale: 0.97 }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
            style={{ backgroundColor: `${alerts[active].color}14`, color: alerts[active].color }}
            animate={{ rotate: [0, -9, 9, 0] }}
            transition={{ duration: 0.55, delay: 0.2 }}
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#8c98a1]">
              {alerts[active].source}
            </div>
            <div className="truncate text-[11px] font-bold text-[#202a31]">{alerts[active].title}</div>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-1 text-[9px] font-bold"
            style={{ backgroundColor: `${alerts[active].color}14`, color: alerts[active].color }}
          >
            {alerts[active].score}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

const featureCardMotion = {
  rest: { y: 0, scale: 1 },
  hover: { y: -6, scale: 1.008 },
}

export function CoreFeatureBento() {
  const reduceMotion = useReducedMotion()

  return (
    <section className="relative overflow-hidden border-t border-black/[0.05] bg-[#fafafa] py-[110px] md:py-[140px]">
      <div className="pointer-events-none absolute left-1/2 top-[-200px] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(10,132,255,0.055),transparent_68%)]" />
      <div className="relative mx-auto max-w-[1200px] px-5 md:px-8">
        <motion.div
          className="mb-12 grid items-end gap-8 lg:mb-14 lg:grid-cols-[1.15fr_0.85fr]"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div variants={entrance}>
            <FeaturePill />
            <h2 className="mt-4 max-w-[670px] font-[var(--font-jakarta)] text-[clamp(38px,5vw,64px)] font-extrabold leading-[1.03] tracking-[-0.052em] text-[#101316]">
              Everything you need to find buyers
            </h2>
          </motion.div>
          <motion.div variants={entrance} className="flex flex-col items-start gap-6 lg:items-end">
            <p className="max-w-[430px] text-[15px] leading-[1.65] text-[#53606a] lg:text-right">
              Monitor real conversations, rank buyer intent, and turn each qualified opportunity into a measured outcome.
            </p>
            <PremiumCtaButton href="#pricing">
              View plans
            </PremiumCtaButton>
          </motion.div>
        </motion.div>

        <motion.div
          className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(310px,1fr)]"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-70px' }}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <motion.article
              variants={entrance}
              initial="rest"
              whileHover={reduceMotion ? undefined : 'hover'}
              animate="rest"
              className="flex min-h-[355px] flex-col overflow-hidden rounded-[21px] bg-[#edf1f4] px-7 pb-6 pt-8"
            >
              <motion.div variants={featureCardMotion} className="flex h-full flex-col">
                <h3 className="text-center text-[19px] font-bold tracking-[-0.025em] text-[#1a2025]">Precision intent filters</h3>
                <IntentFilterVisual />
                <p className="mt-auto text-center text-[12.5px] leading-[1.55] text-[#5b6871]">
                  Focus on configured pain points, competitor mentions, and buying language before AI scoring.
                </p>
              </motion.div>
            </motion.article>

            <motion.article
              variants={entrance}
              initial="rest"
              whileHover={reduceMotion ? undefined : 'hover'}
              animate="rest"
              className="flex min-h-[355px] flex-col overflow-hidden rounded-[21px] bg-white px-5 pb-5 pt-8 shadow-[inset_0_0_0_1px_rgba(18,31,40,0.07)]"
            >
              <motion.div variants={featureCardMotion} className="flex h-full flex-col">
                <h3 className="text-center text-[19px] font-bold tracking-[-0.025em] text-[#1a2025]">Live community radar</h3>
                <CommunityRadarVisual />
              </motion.div>
            </motion.article>

            <motion.article
              variants={entrance}
              initial="rest"
              whileHover={reduceMotion ? undefined : 'hover'}
              animate="rest"
              className="relative min-h-[335px] overflow-hidden rounded-[21px] bg-[linear-gradient(145deg,#e4f7ff_0%,#bfe4f4_42%,#8bc5e5_100%)] px-8 pt-8 md:col-span-2"
            >
              <motion.div variants={featureCardMotion}>
                <div className="relative z-10 text-center">
                  <h3 className="text-[20px] font-bold tracking-[-0.025em] text-[#182129]">Opportunity workspace</h3>
                  <p className="mx-auto mt-1.5 max-w-[480px] text-[12.5px] leading-[1.5] text-[#4f6674]">
                    Keep the source thread, intent reasoning, draft, review state, and attribution evidence together.
                  </p>
                </div>
                <OpportunityWorkspaceVisual />
              </motion.div>
            </motion.article>
          </div>

          <div className="grid gap-5 lg:grid-rows-[minmax(0,1fr)_210px]">
            <motion.article
              variants={entrance}
              initial="rest"
              whileHover={reduceMotion ? undefined : 'hover'}
              animate="rest"
              className="flex min-h-[460px] flex-col overflow-hidden rounded-[21px] bg-[#080808] px-8 py-9 text-white"
            >
              <motion.div variants={featureCardMotion} className="flex h-full flex-col">
                <div className="text-center">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#77808c]">Contextual scoring</div>
                  <h3 className="text-[20px] font-bold tracking-[-0.025em]">AI intent intelligence</h3>
                </div>
                <IntentDecisionVisual />
                <p className="mt-auto text-center text-[12.5px] leading-[1.55] text-[#9ea5ad]">
                  Score each conversation from 0–100 using the language, context, and configured product profile.
                </p>
              </motion.div>
            </motion.article>

            <motion.article
              variants={entrance}
              initial="rest"
              whileHover={reduceMotion ? undefined : 'hover'}
              animate="rest"
              className="overflow-hidden rounded-[21px] bg-[#edf1f4] px-6 py-6"
            >
              <motion.div variants={featureCardMotion}>
                <h3 className="text-center text-[19px] font-bold tracking-[-0.025em] text-[#1a2025]">High-intent alerts</h3>
                <BuyerAlertVisual />
              </motion.div>
            </motion.article>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

type ComparisonMode = 'before' | 'after'

const comparisonContent = {
  before: {
    eyebrow: 'Without a unified intent workflow',
    title: 'Customer discovery stays fragmented',
    bullets: [
      'Buying conversations are buried across separate communities',
      'Basic keyword alerts surface noise without buyer context',
      'Research, drafting, and follow-up happen in disconnected tools',
      'Replies are difficult to connect with clicks or conversions',
    ],
    metrics: [
      { value: 'Manual', label: 'Searching and qualification' },
      { value: 'Unknown', label: 'What happened after the reply' },
    ],
  },
  after: {
    eyebrow: 'With BuyerWatch',
    title: 'Every opportunity carries its evidence',
    bullets: [
      'Reddit and Bluesky conversations arrive in one ranked queue',
      'Intent reasoning and the original thread remain attached',
      'Product-aware drafts stay behind review and policy controls',
      'Recorded clicks, conversions, and revenue connect to the reply',
    ],
    metrics: [
      { value: '0–100', label: 'Recorded intent score' },
      { value: '3 events', label: 'Click, conversion, revenue' },
    ],
  },
}

function ComparisonKnob({
  mode,
  onToggle,
}: {
  mode: ComparisonMode
  onToggle: () => void
}) {
  return (
    <motion.button
      type="button"
      aria-label={`Show ${mode === 'before' ? 'after' : 'before'} BuyerWatch comparison`}
      onClick={onToggle}
      className="absolute left-1/2 top-0 z-20 h-[104px] w-[104px] -translate-x-1/2 -translate-y-[48px] rounded-full border border-black/25 bg-[linear-gradient(145deg,#f8f8f8_0%,#a9a9a9_42%,#e6e6e6_66%,#888_100%)] p-[8px] shadow-[0_12px_22px_rgba(0,0,0,0.24),inset_0_2px_2px_rgba(255,255,255,0.85),inset_0_-3px_5px_rgba(0,0,0,0.26)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0a84ff]/25"
      whileTap={{ scale: 0.96 }}
    >
      <motion.span
        className="relative block h-full w-full rounded-full border border-black/20 bg-[radial-gradient(circle_at_35%_28%,#f7f7f7_0%,#c7c7c7_40%,#777_100%)] shadow-[inset_0_3px_6px_rgba(255,255,255,0.85),inset_0_-5px_9px_rgba(0,0,0,0.25)]"
        animate={{ rotate: mode === 'before' ? -42 : 42 }}
        transition={{ type: 'spring', stiffness: 180, damping: 21 }}
      >
        <span
          className="absolute left-1/2 top-[-17px] h-8 w-9 -translate-x-1/2 bg-[#171717] shadow-[0_3px_5px_rgba(0,0,0,0.3)]"
          style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
        />
        <span className="absolute left-1/2 top-1/2 h-[32px] w-[32px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/25 bg-[radial-gradient(circle_at_35%_30%,#f8f8f8,#9a9a9a_72%)] shadow-[0_2px_5px_rgba(0,0,0,0.35),inset_0_1px_2px_rgba(255,255,255,0.85)]" />
        <span
          className="absolute bottom-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
          style={{ backgroundColor: mode === 'before' ? '#ff5101' : '#0a84ff' }}
        />
      </motion.span>
    </motion.button>
  )
}

function ComparisonPanel({ mode, setMode }: { mode: ComparisonMode; setMode: (mode: ComparisonMode) => void }) {
  const content = comparisonContent[mode]
  const after = mode === 'after'

  return (
    <div className="relative pt-14">
      <div className="relative grid h-[62px] grid-cols-2 border-b border-[#dce4e9]">
        <button
          type="button"
          onClick={() => setMode('before')}
          className={`pr-12 text-right text-[13px] font-semibold transition-colors md:pr-20 ${after ? 'text-[#b1b7bb]' : 'text-[#20272c]'}`}
        >
          Before BuyerWatch
        </button>
        <button
          type="button"
          onClick={() => setMode('after')}
          className={`border-l border-[#dce4e9] pl-12 text-left text-[13px] font-semibold transition-colors md:pl-20 ${after ? 'text-[#20272c]' : 'text-[#b1b7bb]'}`}
        >
          After BuyerWatch
        </button>
        <ComparisonKnob mode={mode} onToggle={() => setMode(after ? 'before' : 'after')} />
      </div>

      <motion.div
        className="relative grid overflow-hidden rounded-b-[29px] border border-t-0 border-[#dce4e9] bg-[#f7f8f9] shadow-[0_22px_55px_rgba(24,39,50,0.08)]"
        animate={{ backgroundColor: after ? '#f7fafc' : '#f4f6f7' }}
        transition={{ duration: 0.5 }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={mode}
            className="col-start-1 row-start-1 grid min-h-[420px] gap-10 px-7 py-10 md:grid-cols-[1.08fr_0.92fr] md:px-12 md:py-12"
            initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex flex-col justify-center">
              <div className={`mb-3 text-[10px] font-bold uppercase tracking-[0.14em] ${after ? 'text-[#0a72d8]' : 'text-[#7b8993]'}`}>
                {content.eyebrow}
              </div>
              <h3 className="max-w-[490px] text-[clamp(27px,3.3vw,40px)] font-extrabold leading-[1.08] tracking-[-0.04em] !text-[#172027]">
                {content.title}
              </h3>
              <div className="mt-8 divide-y divide-[#dfe5e9] border-y border-[#dfe5e9]">
                {content.bullets.map((bullet, index) => (
                  <motion.div
                    key={bullet}
                    className="grid grid-cols-[25px_1fr] items-start gap-3 py-3"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.06 }}
                  >
                    <span className={`mt-px font-mono text-[10px] font-bold tracking-[-0.02em] ${after ? 'text-[#0a72d8]' : 'text-[#dd4a12]'}`}>
                      0{index + 1}
                    </span>
                    <span className="text-[13px] font-medium leading-[1.5] text-[#52606a]">
                      {bullet}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="flex items-center">
              <div className="relative w-full overflow-hidden rounded-[22px] border border-[#d8e0e5] bg-white shadow-[0_18px_45px_rgba(30,48,61,0.08)]">
                <div className="flex items-center justify-between border-b border-[#e4e9ec] px-5 py-4">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#82909a]">
                      {after ? 'Opportunity record' : 'Disconnected workflow'}
                    </div>
                    <div className="mt-1 text-[14px] font-bold tracking-[-0.02em] text-[#202a31]">
                      {after ? 'Migration platform research' : 'Untracked community mention'}
                    </div>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full ${after ? 'bg-[#0a84ff] shadow-[0_0_0_5px_rgba(10,132,255,0.1)]' : 'bg-[#ff5101] shadow-[0_0_0_5px_rgba(255,81,1,0.1)]'}`} />
                </div>

                <div className="px-5 py-5">
                  <div className="relative">
                    {(after
                      ? ['Source captured', 'Intent qualified', 'Reply reviewed', 'Outcome recorded']
                      : ['Mention found', 'Context checked manually', 'Reply sent', 'Outcome unknown']
                    ).map((step, index) => (
                      <motion.div
                        key={step}
                        className="relative grid grid-cols-[18px_1fr_auto] items-center gap-3 pb-5 last:pb-0"
                        initial={{ opacity: 0, y: 7 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.12 + index * 0.07 }}
                      >
                        {index < 3 && (
                          <span className={`absolute left-[4px] top-[13px] h-[calc(100%-5px)] w-px ${after ? 'bg-[#acd5ff]' : 'bg-[#d9dfe3]'}`} />
                        )}
                        <span className={`relative z-10 h-[9px] w-[9px] rounded-full border-2 bg-white ${after ? 'border-[#0a84ff]' : index === 3 ? 'border-[#ff5101]' : 'border-[#aeb8bf]'}`} />
                        <span className="text-[11px] font-semibold text-[#3e4a52]">{step}</span>
                        <span className={`font-mono text-[9px] uppercase tracking-[0.08em] ${after ? 'text-[#0a72d8]' : 'text-[#8a959c]'}`}>
                          {after ? ['Reddit', '86 / 100', 'Approved', '3 events'][index] : ['Alert', 'Manual', 'Posted', '—'][index]}
                        </span>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-6 grid grid-cols-2 border-t border-[#e4e9ec] pt-5">
                    {content.metrics.map((metric, index) => (
                      <motion.div
                        key={metric.value}
                        className={index === 0 ? 'border-r border-[#e4e9ec] pr-4' : 'pl-4'}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + index * 0.08 }}
                      >
                        <div className="text-[20px] font-extrabold leading-none tracking-[-0.04em] text-[#202a31]">
                          {metric.value}
                        </div>
                        <div className={`mt-2 text-[9px] font-semibold leading-[1.35] ${after ? (index === 0 ? 'text-[#0a72d8]' : 'text-[#dd4a12]') : 'text-[#7c898f]'}`}>
                          {metric.label}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

export function BeforeAfterTransformation() {
  const sectionRef = useRef<HTMLElement>(null)
  const [mode, setMode] = useState<ComparisonMode>('before')
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 68%', 'end 45%'],
  })

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    if (reduceMotion) return
    setMode(progress > 0.48 ? 'after' : 'before')
  })

  return (
    <section ref={sectionRef} className="relative border-t border-black/[0.05] bg-white py-[110px] md:min-h-[980px] md:py-[135px]">
      <div className="relative mx-auto max-w-[850px] px-5 md:sticky md:top-[85px] md:px-8">
        <motion.div
          className="mb-[58px] text-center"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={entrance}
        >
          <h2 className="mx-auto max-w-[720px] font-[var(--font-jakarta)] text-[clamp(38px,5vw,60px)] font-extrabold leading-[1.04] tracking-[-0.052em] text-[#14181b]">
            Customer discovery starts with clear intent
          </h2>
        </motion.div>

        <ComparisonPanel mode={mode} setMode={setMode} />

        <div className="mt-5 flex justify-center">
          <Link
            href="#pricing"
            className="group inline-flex items-center gap-2 text-[12px] font-semibold text-[#53606a] transition-colors hover:text-[#0a84ff]"
          >
            See how the workflow fits your plan
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
