'use client'
import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useInView, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, YAxis } from 'recharts'
import { GaugeMeter } from '@/components/GaugeMeter'
import { RadialGauge } from '@/components/RadialGauge'
import Link from 'next/link'
import {
  Target, Plus, Minus,
  ScanSearch, BrainCircuit, MessageSquareText, Zap,
  MessageSquare, BarChart3, BellRing, TrendingUp,
  ChevronRight, Radar, Gauge, PenLine, Layers, Check as CheckIcon, Sparkles
} from 'lucide-react'
import { springs, staggers } from '@/lib/motion'
import EyebrowBadge from '@/components/EyebrowBadge'
import { StickyFeatureScroll } from '@/components/StickyFeatureScroll'
import { FaReddit } from 'react-icons/fa6'
import { AnimatedIcon } from '@/components/AnimatedIcon'
import {
  CustomKeywordRulesIcon,
  ToneMatchingIcon,
  ApprovalQueueIcon,
  DailyDigestIcon,
  InsightsHubIcon,
  DataSecurityIcon
} from '@/components/CustomFeatureIcons'


const pathVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: {
    pathLength: 1,
    opacity: 1,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      delay: 0.15
    }
  }
}

const platformData = [
  { name: 'Reddit', count: 847, color: '#FF6B35' },
  { name: 'LinkedIn', count: 1428, color: '#0A66C2' }
]

const analyticsData = [
  { day: 'Mon', found: 28, drafted: 18 },
  { day: 'Tue', found: 42, drafted: 31 },
  { day: 'Wed', found: 35, drafted: 24 },
  { day: 'Thu', found: 67, drafted: 48 },
  { day: 'Fri', found: 51, drafted: 38 },
  { day: 'Sat', found: 38, drafted: 27 },
  { day: 'Sun', found: 44, drafted: 32 },
]

const faqs = [
  { q: 'What is Scouto?', a: 'It monitors Reddit, X, and Bluesky for people looking for solutions like yours, scores their intent, and drafts a reply. You just review and send.' },
  { q: 'Will Reddit ban my account?', a: 'No. Scouto never posts without your approval. Since you review and send every reply, it complies with platform rules.' },
  { q: 'Does it work for non-SaaS businesses?', a: 'Yes. As long as your customers talk about their problems online, Scouto can find them.' },
  { q: 'How is this different from Google Alerts?', a: 'Google Alerts finds mentions of your brand. Scouto finds active buying intent from people who don\'t know you yet.' },
  { q: 'How accurate is the intent scoring?', a: 'We classify posts into Buying, Researching, Complaining, and Other. It has a 94% accuracy rate on confirmed buyers.' },
  { q: 'Can I try it for free?', a: 'Yes. Start with 2 keywords and 10 matches a month. No card required.' },
  { q: 'Does this violate Reddit, X, or Bluesky terms of service?', a: 'No. We use public APIs and never auto-post. You are just a human replying to public conversations.' },
  { q: 'Won\'t these replies feel like AI spam?', a: 'Only if you let them. Scouto drafts replies using your product context and voice. If a draft feels off, edit it or skip it.' }
]

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as any } }
}
const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: 'easeOut' } }
}
const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
}

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
const SectionBadge = ({ color, text }: { color: string; text: string }) => (
  <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-surface border border-black/[0.08] rounded-full px-4 py-[6px] shadow-sm mb-5">
    <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    <span className="text-[13px] font-[500] text-[#0A0A0A] tracking-[-0.01em]">{text}</span>
  </motion.div>
)

// Feature icon
const FeatureIcon = ({ icon: Icon }: { icon: React.ElementType }) => (
  <div className="w-12 h-12 bg-[#0A0A0A] rounded-[12px] flex items-center justify-center mb-4 flex-shrink-0"
    style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
    <Icon className="w-5 h-5 text-white" strokeWidth={1.8} />
  </div>
)

// Avatar initials
const Avatar = ({ initials, color }: { initials: string; color: string }) => (
  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-[700]"
    style={{ background: color, color: '#fff', letterSpacing: '-0.02em' }}>
    {initials}
  </div>
)

// Check icon for pricing lists
const Check = () => (
  <svg className="w-4 h-4 flex-shrink-0 text-[#0A0A0A]" fill="none" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const GreenCheck = () => (
  <svg className="w-4 h-4 flex-shrink-0 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const OrangeCheck = () => (
  <svg className="w-[18px] h-[18px] flex-shrink-0 text-[#FF5101]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-surface border border-black/[0.08] shadow-lg rounded-xl px-3 py-1.5">
        <span className="text-[12px] font-bold text-[#0A0A0A]">{payload[0].value} found</span>
      </div>
    )
  }
  return null
}

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
const RedditSVG = () => <FaReddit className="w-full h-full text-[#FF4500]" />
const BlueskySVG = () => (
  <svg viewBox="0 0 600 530" fill="none" className="w-full h-full">
    <path d="M135.72 44.03C202.216 93.848 273.74 195.17 300 249.49c26.262-54.316 97.782-155.638 164.28-205.46C512.26 8.009 590-19.862 590 68.825c0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.38-3.69-10.832-3.707-7.896-.017-2.936-1.193.516-3.707 7.896-13.714 40.255-67.233 197.356-189.63 71.766-64.444-66.128-34.605-132.256 82.697-152.22-67.108 11.421-142.549-7.449-163.25-81.433C20.156 217.613 10 86.535 10 68.825c0-88.687 77.742-60.816 125.72-24.795z" fill="#0085FF" />
  </svg>
)
const XSVG = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full text-[#0A0A0A]">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.732-8.845L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
  </svg>
)

const sourcePlatforms = [
  { name: 'Reddit', sub: 'r/startups + 12,400 more', color: '#FF4500', bg: '#FFF0EB', Icon: RedditSVG, count: '847', textColor: undefined },
  { name: 'Bluesky', sub: '#saas, #buildinpublic', color: '#0085FF', bg: '#EBF4FF', Icon: BlueskySVG, count: '312', textColor: undefined },
  { name: 'X (Twitter)', sub: '#indiehackers, #nocode', color: '#0F1419', bg: '#F0F0F0', Icon: XSVG, count: '523' }
]

const PlatformSourcesWidget = () => {
  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Label */}
      <div style={{ fontSize: '11px', fontFamily: 'var(--font-inter)', fontWeight: 600, letterSpacing: '0.08em', color: '#ADADAD', textTransform: 'uppercase', textAlign: 'center' }}>
        Monitors intent signals on
      </div>

      <div className="flex items-center justify-center gap-8 md:gap-12 px-4">
        {/* Reddit */}
        <div className="flex items-center gap-2.5 opacity-75 hover:opacity-100 transition-opacity duration-200">
          <div className="w-6 h-6 flex-shrink-0">
            <RedditSVG />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', fontFamily: 'var(--font-inter)', letterSpacing: '-0.01em' }}>Reddit</span>
        </div>

        <span style={{ color: '#D1D1D1', fontSize: '18px' }}>•</span>

        {/* Bluesky */}
        <div className="flex items-center gap-2.5 opacity-75 hover:opacity-100 transition-opacity duration-200">
          <div className="w-6 h-6 flex-shrink-0">
            <BlueskySVG />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', fontFamily: 'var(--font-inter)', letterSpacing: '-0.01em' }}>Bluesky</span>
        </div>

        <span style={{ color: '#D1D1D1', fontSize: '18px' }}>•</span>

        {/* X */}
        <div className="flex items-center gap-2.5 opacity-75 hover:opacity-100 transition-opacity duration-200">
          <div className="w-[22px] h-[22px] flex-shrink-0 flex items-center justify-center">
            <XSVG />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', fontFamily: 'var(--font-inter)', letterSpacing: '-0.01em' }}>X (Twitter)</span>
        </div>
      </div>
    </div>
  )
}

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
const WordFadeIn = ({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) => {
  const words = text.split(' ')
  return (
    <span className={`inline-block ${className}`}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden mr-[0.3em] pb-[0.1em] -mb-[0.1em]">
          <motion.span
            className="inline-block"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              type: 'spring',
              damping: 24,
              stiffness: 200,
              delay: delay + i * 0.06
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

const NumberTicker = ({ value, suffix = '' }: { value: number; suffix?: string }) => {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-50px' })
  const spring = useSpring(0, { bounce: 0, duration: 2000 })
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    if (inView) {
      spring.set(value)
    }
  }, [inView, spring, value])

  useEffect(() => {
    return spring.on('change', (latest) => {
      setDisplay(Math.round(latest).toString())
    })
  }, [spring])

  return <span ref={ref}>{display}{suffix}</span>
}
const RedditChatSimulation = () => {
  const [messages, setMessages] = useState<number[]>([])

  useEffect(() => {
    const firstTimer = setTimeout(() => {
      setMessages([0])
    }, 200)

    const timer = setInterval(() => {
      setMessages(prev => {
        if (prev.length === 0) return [0]
        if (prev.length >= 3) return []
        return [...prev, prev.length]
      })
    }, 600)

    return () => {
      clearTimeout(firstTimer)
      clearInterval(timer)
    }
  }, [])

  const content = [
    {
      sender: "u/startup_guy",
      avatar: "https://i.pravatar.cc/100?img=11",
      text: "Any good alternatives to Jira for a small team?",
      time: "10:20",
      isAgent: false,
      color: "#F9A885" // Myniq peach
    },
    {
      sender: "Drafted Reply",
      text: "Check out Linear! Super fast, keyboard shortcuts, clean UI.",
      time: "10:21",
      isAgent: true,
      color: "#4CA9DF" // Myniq blue
    },
    {
      sender: "u/startup_guy",
      avatar: "https://i.pravatar.cc/100?img=11",
      text: "Awesome, will check it out. Thanks!",
      time: "10:22",
      isAgent: false,
      color: "#F9A885" // Myniq peach
    }
  ]

  return (
    <div className="flex flex-col gap-2.5 h-[290px] justify-start w-full mb-3 relative z-10 pt-1">
      <AnimatePresence>
        {messages.map((i) => {
          const msg = content[i]
          const isAgent = msg.isAgent
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={`flex flex-col gap-1 ${isAgent ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5">
                {!isAgent ? (
                  <img src={msg.avatar} alt="avatar" className="w-[24px] h-[24px] rounded-full object-cover shadow-sm" />
                ) : (
                  <div className="w-[24px] h-[24px] rounded-full bg-gradient-to-tr from-[#FF5E3A] to-[#FF9500] flex items-center justify-center shadow-sm">
                    <div className="w-[14px] h-[14px] rounded-full border-[1px] border-white flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>
                  </div>
                )}
                <span style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', fontWeight: 600, color: '#1C1C1E' }}>
                  {msg.sender}
                </span>
              </div>
              <div
                style={{ backgroundColor: msg.color }}
                className="px-3 py-2 text-white rounded-[16px] shadow-[0_1px_4px_rgba(0,0,0,0.02)] max-w-[88%]"
              >
                <div style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', fontWeight: 500, lineHeight: 1.45 }}>
                  {msg.text}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', color: '#ADADAD', fontWeight: 500, paddingLeft: isAgent ? '0' : '2px', paddingRight: isAgent ? '2px' : '0', marginTop: '-2px' }}>
                {msg.time}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

const ChatSimulation = () => {
  const [messages, setMessages] = useState<number[]>([0])

  useEffect(() => {
    const timer = setInterval(() => {
      setMessages(prev => {
        if (prev.length >= 3) return [0]
        return [...prev, prev.length]
      })
    }, 2800)
    return () => clearInterval(timer)
  }, [])

  const content = [
    { text: "Found a high-intent match on r/SaaS", time: "08:14" },
    { text: "Drafted reply for 'looking for alternatives'", time: "08:15" },
    { text: "Score: 94/100 (Buying Intent)", time: "08:15" }
  ]

  return (
    <div className="flex flex-col gap-3 min-h-[160px] justify-end w-full mb-6 relative z-10">
      <AnimatePresence mode="popLayout">
        {messages.map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={springs.snappy}
            className="bg-surface border border-black/[0.06] rounded-[16px] rounded-tl-[4px] p-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)] self-start max-w-[92%]"
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
    const cleanLabel = label.split('-')[0] + ' 2025';
    return (
      <div className="bg-white border border-black/[0.08] shadow-[0_12px_32px_rgba(0,0,0,0.12)] rounded-2xl p-4 min-w-[160px]">
        <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontSize: '13px', fontWeight: 700, color: '#0A0A0A', marginBottom: '8px' }}>
          {cleanLabel}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-6 text-[12px]" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            <span className="flex items-center gap-1.5 text-[#555] font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-black" />
              Discovered
            </span>
            <span className="font-bold text-black">{payload[0]?.value}</span>
          </div>
          <div className="flex items-center justify-between gap-6 text-[12px]" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            <span className="flex items-center gap-1.5 text-[#555] font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0A84FF]" />
              Qualified
            </span>
            <span className="font-bold text-[#0A84FF]">{payload[1]?.value}</span>
          </div>
        </div>
      </div>
    )
  }
  return null
}

const LeadDiscoveryWidget = () => {
  return (
    <div className="w-full h-full flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', color: '#0A0A0A', letterSpacing: '-0.02em' }}>Lead Discovery</h4>
      </div>
      <div className="flex-1 w-full min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={leadDiscoveryData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="colorDiscovered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0A0A0A" stopOpacity={0.03} />
                <stop offset="95%" stopColor="#0A0A0A" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorQualified" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#0A84FF" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              tickFormatter={(tick) => (tick.includes('-') ? '' : tick)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#8E8E93', fontSize: 11, fontFamily: 'var(--font-inter)' }}
            />
            <YAxis
              ticks={[0, 250, 500, 1000]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#8E8E93', fontSize: 11, fontFamily: 'var(--font-inter)' }}
            />
            <Tooltip content={<LeadDiscoveryTooltip />} />
            <Area
              type="monotone"
              dataKey="discovered"
              stroke="#0A0A0A"
              strokeWidth={2}
              fill="url(#colorDiscovered)"
              activeDot={{ r: 5, fill: '#0A0A0A', stroke: '#fff', strokeWidth: 2 }}
            />
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

const BentoPlatformSourcesWidget = () => {
  return (
    <div className="flex flex-col gap-3 w-full px-1">
      {sourcePlatforms.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-black/[0.03] bg-[#F9F9FB] shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:border-black/[0.06] transition-all"
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

const BentoTrafficWidget = () => {
  return (
    <div className="w-full h-full flex flex-col justify-between relative min-h-[280px]">
      <div className="flex items-center justify-between mb-2 z-10">
        <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', color: '#0A0A0A', letterSpacing: '-0.02em' }}>Traffic</h4>
      </div>

      <div className="flex-1 relative flex flex-col justify-center gap-5 px-1 py-2 z-10">
        {/* Grid lines background */}
        <div className="absolute inset-0 flex justify-between pointer-events-none opacity-[0.06] px-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-[1px] border-r border-dashed border-[#0A0A0A] h-full" />
          ))}
        </div>

        {/* Bar 1: Google */}
        <div className="relative w-full">
          <div className="w-full h-10 rounded-[10px] bg-black/[0.03] flex items-center justify-between relative overflow-hidden">
            <div className="h-full bg-black/[0.015] rounded-l-[10px]" style={{ width: '40%' }} />
            <span className="absolute right-4 text-[11px] font-bold text-[#0A0A0A]">40%</span>
          </div>
        </div>

        {/* Bar 2: Facebook */}
        <div className="relative w-full">
          <div className="w-full h-10 rounded-[10px] bg-[#FFF0EB] border border-[#FF6B35]/20 flex items-center relative shadow-sm overflow-hidden">
            <div className="h-full bg-[#FF6B35] rounded-[10px] flex items-center justify-end pr-1.5 transition-all duration-500 shadow-sm" style={{ width: '80%' }}>
              <div className="bg-white border border-[#FF6B35]/30 rounded-full px-2 py-0.5 text-[11px] font-bold text-[#0A0A0A] shadow-sm mr-1">
                80%
              </div>
            </div>
          </div>
        </div>

        {/* Bar 3: X */}
        <div className="relative w-full">
          <div className="w-full h-10 rounded-[10px] bg-black/[0.03] flex items-center justify-between relative overflow-hidden">
            <div className="h-full bg-black/[0.015] rounded-l-[10px]" style={{ width: '20%' }} />
            <span className="absolute right-4 text-[11px] font-bold text-[#0A0A0A]">20%</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-start gap-8 mt-2 text-[13px] font-medium z-10" style={{ fontFamily: 'var(--font-inter)' }}>
        <div className="flex items-center gap-2 text-[#ADADAD]">
          <span className="w-2 h-2 rounded-full bg-black/[0.08]" />
          Google
        </div>
        <div className="flex items-center gap-2 text-[#0A0A0A]">
          <span className="w-2 h-2 rounded-full bg-[#FF6B35]" />
          Facebook
        </div>
        <div className="flex items-center gap-2 text-[#ADADAD]">
          <span className="w-2 h-2 rounded-full bg-black/[0.08]" />
          X
        </div>
      </div>
    </div>
  )
}

// Section wrapper that triggers whileInView

function Section({ children, className = '', delay = 0, id }: { children: React.ReactNode; className?: string; delay?: number; id?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-20px' })
  return (
    <motion.section
      ref={ref}
      id={id}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08, delayChildren: delay } }
      }}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      className={className}
    >
      {children}
    </motion.section>
  )
}

export default function LandingPage() {
  const [activeAccordion, setActiveAccordion] = useState(0)
  const [isYearly, setIsYearly] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  // Navbar scroll animation
  const { scrollY } = useScroll()
  const navBg = useTransform(scrollY, [0, 50], ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.88)'])
  const navBlur = useTransform(scrollY, [0, 50], ['blur(0px)', 'blur(12px)'])
  const navBorder = useTransform(scrollY, [0, 50], ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.06)'])
  const navShadow = useTransform(scrollY, [0, 50], ['none', '0 4px 20px -2px rgba(0,0,0,0.03)'])

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] selection:bg-[#0A84FF]/20">

      {/* ━ ━ ━ ━  section separator: NAVBAR ━ ━ ━ ━  */}
      <motion.nav
        style={{ backgroundColor: navBg, backdropFilter: navBlur, borderColor: navBorder, boxShadow: navShadow }}
        className="fixed top-0 left-0 right-0 z-50 border-b will-change-transform">
        <div className="max-w-7xl mx-auto px-6 h-[60px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity" style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.025em', color: '#0A0A0A' }}>
            <Target className="w-5 h-5 text-[#0A84FF]" strokeWidth={2.2} />
            Scouto
          </Link>
          <div className="hidden md:flex items-center gap-7">
            {['Features', 'How it works', 'Pricing'].map((label) => (
              <Link key={label} href={`#${label.toLowerCase().replace(' ', '-')}`}
                className="text-[14px] font-[450] text-[#6B6B6B] hover:text-[#0A0A0A] transition-colors duration-150">
                {label}
              </Link>
            ))}
            <Link href="/login" className="text-[14px] font-[450] text-[#6B6B6B] hover:text-[#0A0A0A] transition-colors duration-150">Log in</Link>
          </div>
          <Link href="/signup" className="text-[14px] font-[600] bg-[#0A0A0A] text-white px-5 py-2.5 rounded-full hover:bg-[#222] transition-colors duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
            Start Free Trial
          </Link>
        </div>
      </motion.nav>

      {/* ━ ━ ━ ━  section separator: HERO ━ ━ ━ ━  */}
      <section className="hero-mesh relative flex flex-col items-center justify-center px-6 pt-[100px] pb-[40px] overflow-hidden">
        {/* Gradient mesh blobs (optimized static background) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute -top-[10%] -left-[5%] w-[45%] h-[60%] rounded-full opacity-70"
            style={{ background: 'radial-gradient(ellipse, rgba(255,180,100,0.38) 0%, transparent 68%)', filter: 'blur(40px)' }} />
          <div
            className="absolute -top-[15%] right-0 w-[40%] h-[55%] rounded-full opacity-70"
            style={{ background: 'radial-gradient(ellipse, rgba(200,150,255,0.28) 0%, transparent 68%)', filter: 'blur(50px)' }} />
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[50%] h-[30%] opacity-60"
            style={{ background: 'radial-gradient(ellipse, rgba(255,200,150,0.2) 0%, transparent 68%)', filter: 'blur(40px)' }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex flex-col items-center text-center max-w-[880px] mx-auto"
        >
          <EyebrowBadge />

          <h1 className="mb-5 mt-1" style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(52px, 6.5vw, 80px)', letterSpacing: '-0.04em', lineHeight: 1.0, color: '#0A0A0A' }}>
            <WordFadeIn text="Find your customers" />
            <br />
            <WordFadeIn text="where they are." delay={0.3} />
            <br />
            <span style={{ color: '#9B9B9B', fontWeight: 700 }}>Before anyone else does.</span>
          </h1>

          <p className="max-w-[520px] mb-10" style={{ fontFamily: 'var(--font-inter), sans-serif', fontWeight: 400, fontSize: '17px', lineHeight: 1.65, color: '#6B6B6B' }}>
            Monitor professional channels 24/7. Detect high-intent conversations, draft personalized replies, and acquire customers organically.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={springs.snappy}>
              <div className="relative group inline-flex w-full sm:w-auto">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#FF2E93] to-[#FF8A00] rounded-full blur-[7px] opacity-65 group-hover:opacity-95 transition duration-300 pointer-events-none translate-y-[2px]" />
                <Link href="/signup" className="relative w-full sm:w-auto bg-[#0A0A0A] text-white text-[15px] font-[600] flex items-center justify-center px-8 py-[14px] rounded-full shadow-[inset_0_2px_3px_rgba(255,255,255,0.12)]">
                  Start 14-Day Free Trial
                </Link>
              </div>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={springs.snappy}>
              <Link href="#how-it-works" className="w-full sm:w-auto px-7 py-[14px] rounded-full font-[500] text-[15px] text-[#0A0A0A] hover:bg-black/[0.04] border border-black/[0.10] flex items-center justify-center gap-2 transition-colors duration-150">
                See how it works
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </motion.div>
          </div>

          <p className="text-[13px] text-[#ADADAD] font-[450]">Free to start &middot; No credit card &middot; Setup in 2 minutes &middot; Cancel anytime</p>
        </motion.div>

        {/* Platform logos — clean, no box */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 mt-12 w-full"
        >
          <PlatformSourcesWidget />
        </motion.div>
      </section>


      <div className="relative z-20">

        {/* ━ ━ ━ ━  section separator: PROBLEM ━ ━ ━ ━  */}
        <Section className="bg-white py-20 border-b border-black/[0.05]">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <SectionBadge color="#FF3B30" text="The Problem" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.04em', lineHeight: 1.1, color: '#0A0A0A' }}>
                Cold outreach doesn't work anymore.
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { title: 'Cold email response is <1%', desc: 'Inboxes are flooded. Nobody replies to cold pitches anymore.' },
                { title: 'Manual search is a time sink', desc: 'Scrolling subreddits and social feeds takes hours you don\'t have.' },
                { title: 'The window is minutes', desc: 'If you don\'t reply within 15 minutes, someone else already did.' }
              ].map((p, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <span className="text-[12px] font-bold text-[#FF3B30] uppercase tracking-wider">0{i+1}</span>
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', color: '#0A0A0A' }}>{p.title}</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: HOW IT WORKS ━ ━ ━ ━  */}
        <Section id="how-it-works" className="bg-white pt-[120px] pb-[120px] border-b border-black/[0.05]">
          <div className="max-w-[1100px] mx-auto px-[24px]">
            <div className="text-center mb-[64px]">
              <SectionBadge color="#0A84FF" text="How It Works" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(36px, 4vw, 54px)', letterSpacing: '-0.045em', lineHeight: 1.05, color: '#0A0A0A' }}>
                Simplify organic growth<br />step by step
              </h2>
            </div>

            <motion.div variants={fadeUp} className="myniq-card p-[48px] bg-white relative">
              <div className="relative">
                {/* Connecting line passing through center of step dots */}
                <div className="absolute top-[5px] left-[8px] right-[calc(25%+8px)] h-[1.5px] bg-black/[0.06] hidden md:block z-0" />

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-6 relative z-10">
                  {/* Step 1 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF9F0A] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#C97D00] bg-[#FF9F0A]/10 border border-[#FF9F0A]/15">
                      01 | Monitor
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>
                      Set your keywords
                    </h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>
                      Competitor names, pain points, and buying signals. Scouto monitors Reddit, X, and Bluesky 24/7.
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#BF5AF2] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#8E2DE2] bg-[#BF5AF2]/10 border border-[#BF5AF2]/15">
                      02 | Score
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>
                      AI scores intent
                    </h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>
                      Each post gets a buyer intent score from 0-100. High-intent posts hit your queue immediately.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#0A84FF] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#0062CC] bg-[#0A84FF]/10 border border-[#0A84FF]/15">
                      03 | Draft
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>
                      AI drafts a reply
                    </h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>
                      Scouto writes a reply using your profile, past replies, and post context. No generic templates.
                    </p>
                  </div>

                  {/* Step 4 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#30D158] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#1C7A30] bg-[#30D158]/10 border border-[#30D158]/15">
                      04 | Approve & Send
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>
                      Review and post
                    </h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>
                      Read the draft, edit if needed, and hit send. Nothing posts without your manual approval.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-black/[0.06] pt-8 mt-12 flex flex-col sm:flex-row items-center justify-between gap-5">
                <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '-0.025em', color: '#0A0A0A' }}>
                  Acquire buyers organically
                </span>
                <Link href="/signup" className="flex items-center gap-2 bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-[600] px-8 py-3.5 rounded-full transition-all duration-200 shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                  Start 14-Day Free Trial
                </Link>
              </div>
            </motion.div>
          </div>
        </Section>

        {/* FEATURES */}


        <Section id="features" className="bg-white pt-[50px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-[24px]">
            <SectionBadge color="#0A84FF" text="Features" />

            <div className="grid lg:grid-cols-2 gap-[16px] lg:gap-20 mb-[100px] items-center">
              {/* Left: Accordion */}
              <div className="flex flex-col justify-center">
                <motion.h2 variants={fadeUp} className="mb-5"
                  style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(36px, 4vw, 54px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A' }}>
                  Your partner in<br className="hidden lg:block" /> organic growth
                </motion.h2>
                <div className="w-full border-t border-black/[0.07] mb-1" />

                <div className="w-full">
                  {[
                    { title: 'Buyer Intent Scoring', body: 'Every conversation scored 0-100 for purchase likelihood. No more wading through noise — you see only the conversations that matter.' },
                    { title: 'AI Reply Drafting', body: 'Replies written in your exact voice. Context-aware, helpful, never spammy. Review, edit, post. Done.' },
                    { title: '24/7 Keyword Monitoring', body: 'LinkedIn, Reddit, Hacker News, X, and more scanned continuously. Competitor mentions, pain-point keywords, and buying signals.' }
                  ].map((item, i) => (
                    <motion.div key={i} variants={fadeUp} className="border-b border-black/[0.07] overflow-hidden">
                      <button onClick={() => setActiveAccordion(i)} className="w-full text-left py-6 flex items-center justify-between gap-4">
                        <h3 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '19px', letterSpacing: '-0.02em', color: activeAccordion === i ? '#0A0A0A' : '#ADADAD', transition: 'color 0.2s' }}>
                          {item.title}
                        </h3>
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-black/[0.05] flex items-center justify-center transition-transform duration-300"
                          style={{ transform: activeAccordion === i ? 'rotate(180deg)' : 'none' }}>
                          {activeAccordion === i
                            ? <Minus className="w-3 h-3 text-[#0A0A0A]" strokeWidth={2.5} />
                            : <Plus className="w-3 h-3 text-[#0A0A0A]" strokeWidth={2.5} />
                          }
                        </div>
                      </button>
                      <AnimatePresence>
                        {activeAccordion === i && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#6B6B6B', lineHeight: 1.65, paddingBottom: '24px', paddingRight: '40px' }}>
                              {item.body}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Right: Mockup Card */}
              <motion.div variants={fadeUp} className="relative">
                <div className="myniq-card p-[28px] relative z-10 flex flex-col h-[400px] justify-between">
                  <div className="flex-1 flex flex-col justify-center mb-6">
                    <LeadDiscoveryWidget />
                  </div>
                  <div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '20px', letterSpacing: '-0.025em', color: '#0A0A0A', marginBottom: '5px' }}>Lead Discovery</h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>Track discovered vs qualified leads generated in real time</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* ━ ━ ━ ━  section separator ━ ━ ━ ━  */}
            <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[24px]">
              {[
                {
                  id: 'radar',
                  title: 'Live Monitoring',
                  body: 'Real-time Reddit tracking across every keyword you set'
                },
                {
                  id: 'gauge',
                  title: 'Intent Scoring',
                  body: "Every match ranked 0-100 so you know what's worth your time"
                },
                {
                  id: 'pen',
                  title: 'AI Drafting',
                  body: 'Replies written in your voice, ready to review and send'
                },
                {
                  id: 'layers',
                  title: 'Multi-Platform',
                  body: 'Reddit live now, more platforms rolling out soon'
                },
              ].map(({ id, title, body }, i) => (
                <motion.div key={i} variants={fadeUp} whileHover={{ y: -4 }} transition={springs.snappy} className="flex flex-col">
                  <div className="mb-5 text-[#FF5101]">
                    {id === 'radar' && (
                      <Radar
                        className="animate-crawl-cashflow"
                        size={44}
                        strokeWidth={1.5}
                        color="currentColor"
                      />
                    )}
                    {id === 'gauge' && (
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        {/* Clean 270° Speedometer Dial Arc */}
                        <path d="M5.64 18.36A9 9 0 1 1 18.36 18.36" />
                        {/* Perimeter Tick Marks */}
                        <path d="M12 3v1.5M3 12h1.5M21 12h-1.5M5.64 5.64l1.06 1.06M18.36 5.64l-1.06 1.06" />
                        {/* Animated Sweeping Needle */}
                        <motion.line
                          x1="12"
                          y1="12"
                          x2="12"
                          y2="5.5"
                          animate={{ rotate: [-95, 95, -95] }}
                          transition={{
                            repeat: Infinity,
                            duration: 3.2,
                            ease: "easeInOut"
                          }}
                          style={{ transformOrigin: "12px 12px", transformBox: "view-box" }}
                        />
                        {/* Solid Central Pivot Point */}
                        <circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none" />
                      </svg>
                    )}
                    {id === 'pen' && (
                      <svg className="animate-crawl-pen" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="M15 5l4 4" />
                        <path d="M5 3v2M4 4h2" strokeOpacity="0.5" />
                        <path d="M21 14v2M20 15h2" strokeOpacity="0.35" />
                      </svg>
                    )}
                    {id === 'layers' && (
                      <Layers
                        className="animate-crawl-sync"
                        size={44}
                        strokeWidth={1.5}
                        color="currentColor"
                      />
                    )}
                  </div>
                  <h4 style={{
                    fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                    fontSize: '17px',
                    fontWeight: 600,
                    color: '#0A0A0A',
                    letterSpacing: '-0.01em',
                    marginBottom: '6px'
                  }}>
                    {title}
                  </h4>
                  <p style={{
                    fontFamily: 'var(--font-inter), sans-serif',
                    fontSize: '14px',
                    fontWeight: 400,
                    color: '#6B6B6B',
                    lineHeight: 1.5,
                    maxWidth: '220px'
                  }}>
                    {body}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: MORE FEATURES (Bento Grid) ━ ━ ━ ━  */}
        <Section className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-[24px] text-center">
            <SectionBadge color="#0A84FF" text="More Features" />
            <motion.h2 variants={fadeUp} className="mx-auto mb-[52px]"
              style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A', maxWidth: '560px' }}>
              Tools that find warm leads<br />while you sleep
            </motion.h2>

            <div className="flex flex-col gap-[12px] text-left">
              <motion.div variants={staggerContainer} className="grid md:grid-cols-5 gap-[12px]">
                {/* ━ ━ ━ ━  section separator ━ ━ ━ ━  */}
                <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col h-[400px] md:col-span-3 justify-between">
                  <BentoTrafficWidget />
                </motion.div>

                {/* ━ ━ ━ ━  section separator ━ ━ ━ ━  */}
                <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col h-[400px] md:col-span-2">
                  <div className="flex-1 flex flex-col items-center justify-center mb-4">
                    <RadialGauge percentage={72} label="Drafted / Posted" />
                    <div className="flex items-center gap-4 mt-3" style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', fontWeight: 500, color: '#ADADAD' }}>
                      <span><span className="text-[#0A0A0A] font-[600]"><NumberTicker value={124} /></span> drafted</span>
                      <span style={{ color: '#E5E5E5' }}> — </span>
                      <span><span className="text-[#0A0A0A] font-[600]"><NumberTicker value={89} /></span> posted</span>
                    </div>
                  </div>
                  <div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '-0.025em', color: '#0A0A0A', marginBottom: '5px' }}>Reply Performance</h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Track how your approved replies perform across every platform</p>
                  </div>
                </motion.div>
              </motion.div>

              <motion.div variants={staggerContainer} className="grid md:grid-cols-3 gap-[12px]">
                {/* ━ ━ ━ ━  section separator ━ ━ ━ ━  */}
                <motion.div variants={fadeUp} whileHover={{ y: -3 }} transition={springs.snappy} className="myniq-card p-[28px] flex flex-col">
                  <div className="flex-1 flex flex-col justify-center w-full py-3">
                    <BentoPlatformSourcesWidget />
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '5px' }}>Multi-Platform Coverage</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Signals from LinkedIn, Reddit, Hacker News, X, and more — all in one place, always live.</p>
                </motion.div>

                {/* ━ ━ ━ ━  section separator ━ ━ ━ ━  */}
                <motion.div variants={fadeUp} whileHover={{ y: -3 }} transition={springs.snappy} className="myniq-card p-[28px] flex flex-col">
                  <div className="flex-1 flex flex-col justify-center items-center h-full pt-4">
                    <ChatSimulation />
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '5px' }}>Morning Digest</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Wake up to overnight leads, pre-sorted by intent score.</p>
                </motion.div>

                {/* ━ ━ ━ ━  section separator ━ ━ ━ ━  */}
                <motion.div variants={fadeUp} whileHover={{ y: -3 }} transition={springs.snappy} className="myniq-card p-[28px] flex flex-col">
                  <div className="flex-1 flex flex-col justify-center gap-2.5 mb-6">
                    {[
                      { label: 'Buying', score: '94', dot: '#30D158' },
                      { label: 'Researching', score: '71', dot: '#0A84FF' },
                      { label: 'Complaining', score: '58', dot: '#0A84FF' },
                      { label: 'Other', score: '23', dot: '#8E8E93' },
                    ].map((item, i) => (
                      <div key={i} className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-black/[0.04] bg-surface-secondary shadow-[0_1px_2px_rgba(0,0,0,0.015)] transition-all duration-200 hover:border-black/[0.08]">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: item.dot }} />
                          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', fontWeight: 600, color: '#1C1C1E' }}>{item.label}</span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontSize: '13px', fontWeight: 700, color: '#6B6B6B' }}>
                          {item.score}% intent
                        </span>
                      </div>
                    ))}
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '5px' }}>Smart Categorization</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Every match auto-categorized so you know exactly where to focus.</p>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: ANALYTICS ━ ━ ━ ━  */}
        <Section className="bg-[#F9F9FB] pt-[140px] pb-[140px]">
          <div className="max-w-[1000px] mx-auto px-[24px] text-center">
            <SectionBadge color="#4ade80" text="Core Features" />
            <motion.h2 
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeUp} 
              className="mb-5 text-[#0A0A0A]"
              style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(44px, 6vw, 68px)', letterSpacing: '-0.04em', lineHeight: 1.05 }}
            >
              Everything You Need.<br />Nothing Extra.
            </motion.h2>
            <motion.p 
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeUp}
              className="text-[#6b7280] text-[16px] max-w-[620px] mx-auto mb-20 leading-relaxed" 
              style={{ fontFamily: 'var(--font-inter)' }}
            >
              A tight, powerful set of features crafted to make your team faster and more focused.
            </motion.p>

            <motion.div 
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer} 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-20 text-center"
            >
              {[
                { icon: CustomKeywordRulesIcon, title: 'Custom Keyword Rules', body: 'Exact-match, negative keywords, subreddit filters. You decide what counts as a lead.' },
                { icon: ToneMatchingIcon, title: 'Tone Matching', body: "Drafts sound like you wrote them — not like a bot dropped a link and left." },
                { icon: ApprovalQueueIcon, title: 'Approval Queue', body: 'Nothing posts without you clicking approve first. Full control, every time.' },
                { icon: DailyDigestIcon, title: 'Daily Digest', body: 'One morning summary of every match, already scored and ready to review.' },
                { icon: InsightsHubIcon, title: 'Insights Hub', body: "Get clear reports on activity, progress, and bottlenecks—instantly." },
                { icon: DataSecurityIcon, title: 'Data Security', body: 'Your keywords, drafts, and matches stay private and encrypted. Always.' }, // Force Next.js compilation refresh
              ].map(({ icon: Icon, title, body }, i) => (
                <motion.div 
                  key={i} 
                  variants={fadeUp} 
                  whileHover={{ y: -4 }} 
                  transition={springs.snappy} 
                  className="flex flex-col items-center"
                >
                  <motion.div 
                    className="mb-6 flex items-center justify-center text-[#0A0A0A]"
                    whileHover={{ scale: 1.05 }}
                    transition={springs.snappy}
                  >
                    {/* Render custom icons directly to avoid raw DOM-manipulating draw collisions */}
                    <div style={{ display: 'inline-flex', lineHeight: 0 }} className="animated-icon-wrapper">
                      <Icon size={64} color="#0A0A0A" strokeWidth={1.75} style={{ display: 'block' }} />
                    </div>
                  </motion.div>
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '20px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>{title}</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#6B6B6B', lineHeight: 1.6, maxWidth: '290px' }}>{body}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </Section>





        {/* ━ ━ ━ ━  section separator: STICKY FEATURE SCROLL (HOW IT WORKS) ━ ━ ━ ━  */}
        <div id="how-it-works">
          <StickyFeatureScroll />
        </div>

        {/* ━ ━ ━ ━  section separator: SOCIAL PROOF ━ ━ ━ ━  */}
        <Section className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div variants={fadeUp} className="text-center mb-[64px]">
              <SectionBadge color="#0A84FF" text="From the community" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A', marginBottom: '10px' }}>
                Founders who stopped<br />guessing, started finding
              </h2>
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: '16px', color: '#6B6B6B', lineHeight: 1.65, maxWidth: '440px', margin: '0 auto' }}>
                Real results from founders using Scouto to grow organically on Reddit.
              </p>
            </motion.div>

            <motion.div variants={staggerContainer} className="grid md:grid-cols-3 gap-[12px] auto-rows-min">
              {/* Big quote */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] md:col-span-2">
                <svg className="w-7 h-7 text-[#E0E0E0] mb-4" viewBox="0 0 28 22" fill="currentColor">
                  <path d="M0 22V13.273C0 5.948 4.693 1.386 14.08 0l1.12 2.182C10.4 3.164 7.947 5.6 7.28 9.455H12V22H0zm16 0V13.273C16 5.948 20.693 1.386 30.08 0l1.12 2.182C26.4 3.164 23.947 5.6 23.28 9.455H28V22H16z" />
                </svg>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '16px', color: '#0A0A0A', lineHeight: 1.7, marginBottom: '20px' }}>
                  "Scouto found me 3 paying customers in the first week. I reviewed the drafts, posted them, and watched signups roll in. Nothing else I've tried has been this direct."
                </p>
                <div className="flex items-center gap-3">
                  <Avatar initials="JC" color="#0A0A0A" />
                  <div>
                    <span style={{ fontFamily: 'var(--font-inter)', fontWeight: 600, fontSize: '14px', color: '#0A0A0A' }}>James Carter</span>
                    <span style={{ fontFamily: 'var(--font-inter)', fontWeight: 400, fontSize: '14px', color: '#ADADAD' }}> — Founder, Mailflow</span>
                  </div>
                </div>
              </motion.div>

              {/* Stat */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col justify-end min-h-[200px]">
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '56px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A', marginBottom: '6px' }}>3x</div>
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '3px' }}>More organic traffic</div>
                <div style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: '#ADADAD' }}>vs. manual Reddit outreach</div>
              </motion.div>

              {/* Small quote */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col justify-between min-h-[190px]">
                <div>
                  <svg className="w-5 h-5 text-[#E0E0E0] mb-3" viewBox="0 0 28 22" fill="currentColor">
                    <path d="M0 22V13.273C0 5.948 4.693 1.386 14.08 0l1.12 2.182C10.4 3.164 7.947 5.6 7.28 9.455H12V22H0zm16 0V13.273C16 5.948 20.693 1.386 30.08 0l1.12 2.182C26.4 3.164 23.947 5.6 23.28 9.455H28V22H16z" />
                  </svg>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#0A0A0A', lineHeight: 1.65, marginBottom: '14px' }}>
                    "I was spending 2 hours searching Reddit manually. Now Scouto does it while I sleep and I just work the queue."
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <Avatar initials="WH" color="#3A3A3A" />
                  <div>
                    <span style={{ fontFamily: 'var(--font-inter)', fontWeight: 600, fontSize: '13px', color: '#0A0A0A' }}>William Harris</span>
                    <span style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: '#ADADAD' }}> — Solo Founder</span>
                  </div>
                </div>
              </motion.div>

              {/* Stat 2 */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col justify-end min-h-[190px]">
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '56px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A', marginBottom: '6px' }}>94%</div>
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A' }}>Buying intent accuracy</div>
              </motion.div>

              {/* Small quote 2 */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col justify-between min-h-[190px]">
                <div>
                  <svg className="w-5 h-5 text-[#E0E0E0] mb-3" viewBox="0 0 28 22" fill="currentColor">
                    <path d="M0 22V13.273C0 5.948 4.693 1.386 14.08 0l1.12 2.182C10.4 3.164 7.947 5.6 7.28 9.455H12V22H0zm16 0V13.273C16 5.948 20.693 1.386 30.08 0l1.12 2.182C26.4 3.164 23.947 5.6 23.28 9.455H28V22H16z" />
                  </svg>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#0A0A0A', lineHeight: 1.65, marginBottom: '14px' }}>
                    "The drafts sound like me. People have replied thinking I wrote them myself. That's exactly what I wanted."
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <Avatar initials="MB" color="#3A3A3A" />
                  <div>
                    <span style={{ fontFamily: 'var(--font-inter)', fontWeight: 600, fontSize: '13px', color: '#0A0A0A' }}>Matthew Brooks</span>
                    <span style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: '#ADADAD' }}> — Newsletter Creator</span>
                  </div>
                </div>
              </motion.div>

              {/* Wide quote */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] md:col-span-3">
                <svg className="w-7 h-7 text-[#E0E0E0] mb-4" viewBox="0 0 28 22" fill="currentColor">
                  <path d="M0 22V13.273C0 5.948 4.693 1.386 14.08 0l1.12 2.182C10.4 3.164 7.947 5.6 7.28 9.455H12V22H0zm16 0V13.273C16 5.948 20.693 1.386 30.08 0l1.12 2.182C26.4 3.164 23.947 5.6 23.28 9.455H28V22H16z" />
                </svg>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '16px', color: '#0A0A0A', lineHeight: 1.7, marginBottom: '20px', maxWidth: '680px' }}>
                  "We added Scouto last month and it surfaced 15 qualified leads from Reddit alone. The intent scoring is genuinely impressive — it filters out the noise better than anything we'd tried before."
                </p>
                <div className="flex items-center gap-3">
                  <Avatar initials="DP" color="#0A0A0A" />
                  <div>
                    <span style={{ fontFamily: 'var(--font-inter)', fontWeight: 600, fontSize: '14px', color: '#0A0A0A' }}>Daniel Parker</span>
                    <span style={{ fontFamily: 'var(--font-inter)', fontWeight: 400, fontSize: '14px', color: '#ADADAD' }}> — CEO, GrowthLayer</span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: PRICING ━ ━ ━ ━  */}
        <Section id="pricing" className="bg-[#F2F2F5] pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-[24px]">
            <motion.div variants={fadeUp} className="text-center mb-[36px]">
              <SectionBadge color="#FF5101" text="Pricing" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A' }}>
                Simple, honest pricing
              </h2>
            </motion.div>

            {/* Toggle */}
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 mb-12">
              <span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', fontWeight: 600, color: !isYearly ? '#0A0A0A' : '#ADADAD' }}>Monthly</span>
              <button onClick={() => setIsYearly(!isYearly)} className="w-[48px] h-[26px] rounded-full relative transition-colors duration-200 cursor-pointer bg-[#FF5101]" aria-label="Toggle yearly billing">
                <motion.div
                  className="w-[18px] h-[18px] bg-white rounded-full absolute top-[4px] shadow-sm"
                  animate={{ x: isYearly ? 26 : 4 }}
                  transition={springs.snappy}
                />
              </button>
              <span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', fontWeight: 600, color: isYearly ? '#0A0A0A' : '#ADADAD' }}>Yearly</span>
              <AnimatePresence>
                {isYearly && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={springs.snappy}
                    className="bg-[#FFE3D8] text-[#FF5101] text-[11px] font-[800] px-3 py-1 rounded-full tracking-[0.02em] uppercase"
                  >
                    Save 20%
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.div variants={staggerContainer} className="grid lg:grid-cols-3 gap-7 items-stretch">
              {/* Free Card */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -6 }}
                transition={springs.snappy}
                className="bg-white rounded-[32px] border border-black/[0.05] p-9 flex flex-col justify-between shadow-[0_10px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all duration-300"
              >
                <div>
                  <h3 className="font-sans font-medium text-[22px] tracking-tight text-[#111111] mb-4">
                    Free
                  </h3>
                  <div className="flex items-baseline mb-4">
                    <span className="font-sans font-extrabold text-[48px] tracking-[-0.03em] leading-none text-[#111111]">
                      $0
                    </span>
                    <span className="font-sans text-[15px] text-[#8E8E93] ml-2 font-normal">
                      /per month
                    </span>
                  </div>
                  <p className="font-sans text-[15px] text-[#666666] font-normal mb-8 leading-[1.55] min-h-[46px]">
                    Great for trying out Scouto features and signals.
                  </p>

                  <Link href="/signup" className="w-full bg-[#FF5101] hover:bg-[#E04400] text-white text-[15px] font-[600] text-center py-3.5 rounded-full transition-all duration-150 shadow-[0_4px_14px_rgba(255,81,1,0.25)] block mb-7">
                    Get Started
                  </Link>

                  <div className="w-full border-t border-dashed border-[#D4D4D8] mb-7" />

                  <div className="flex flex-col gap-4">
                    {[
                      '3 Automation Workflows',
                      '1,000 Tasks / month',
                      'Basic Integrations',
                      'AI Workflow Builder (Lite)',
                      'Community Support'
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-3 text-left">
                        <CheckIcon className="w-[18px] h-[18px] text-[#00A859] shrink-0" strokeWidth={2.5} />
                        <span className="font-sans text-[14.5px] text-[#333333] font-normal leading-snug">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Professional Card */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -6 }}
                transition={springs.snappy}
                className="bg-white rounded-[32px] border border-black/[0.05] p-9 flex flex-col justify-between shadow-[0_10px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all duration-300"
              >
                <div>
                  <h3 className="font-sans font-medium text-[22px] tracking-tight text-[#111111] mb-4">
                    Professional
                  </h3>
                  <div className="flex items-baseline mb-4">
                    <span className="font-sans font-extrabold text-[48px] tracking-[-0.03em] leading-none text-[#111111]">
                      ${isYearly ? '79' : '97'}
                    </span>
                    <span className="font-sans text-[15px] text-[#8E8E93] ml-2 font-normal">
                      /per month
                    </span>
                  </div>
                  <p className="font-sans text-[15px] text-[#666666] font-normal mb-8 leading-[1.55] min-h-[46px]">
                    Best for solo founders, freelancers & growing teams.
                  </p>

                  <Link href="/signup" className="w-full bg-[#FF5101] hover:bg-[#E04400] text-white text-[15px] font-[600] text-center py-3.5 rounded-full transition-all duration-150 shadow-[0_4px_14px_rgba(255,81,1,0.25)] block mb-7">
                    Get Started
                  </Link>

                  <div className="w-full border-t border-dashed border-[#D4D4D8] mb-7" />

                  <div className="flex flex-col gap-4">
                    {[
                      'Everything in Free',
                      '20 Automation Workflows',
                      '15,000 Tasks / month',
                      'API Access',
                      'Advanced Integrations (CRM, Notion, Slack, etc.)'
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-3 text-left">
                        <CheckIcon className="w-[18px] h-[18px] text-[#00A859] shrink-0" strokeWidth={2.5} />
                        <span className="font-sans text-[14.5px] text-[#333333] font-normal leading-snug">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Enterprise Card */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -6 }}
                transition={springs.snappy}
                className="bg-[#FFEFE9] rounded-[32px] border border-[#FF5101]/15 p-9 flex flex-col justify-between shadow-[0_10px_30px_rgba(255,81,1,0.04)] hover:shadow-[0_20px_40px_rgba(255,81,1,0.08)] transition-all duration-300"
              >
                <div>
                  <h3 className="font-sans font-medium text-[22px] tracking-tight text-[#FF5101] mb-4">
                    Enterprise
                  </h3>
                  <div className="flex items-baseline mb-4">
                    <span className="font-sans font-extrabold text-[48px] tracking-[-0.03em] leading-none text-[#111111]">
                      ${isYearly ? '209' : '257'}
                    </span>
                    <span className="font-sans text-[15px] text-[#8E8E93] ml-2 font-normal">
                      /per month
                    </span>
                  </div>
                  <p className="font-sans text-[15px] text-[#666666] font-normal mb-8 leading-[1.55] min-h-[46px]">
                    Ideal for scaling companies that need deep automation & custom setups.
                  </p>

                  <Link href="/signup" className="w-full bg-[#FF5101] hover:bg-[#E04400] text-white text-[15px] font-[600] text-center py-3.5 rounded-full transition-all duration-150 shadow-[0_4px_14px_rgba(255,81,1,0.25)] block mb-7">
                    Get Started
                  </Link>

                  <div className="w-full border-t border-dashed border-[#FF5101]/20 mb-7" />

                  <div className="flex flex-col gap-4">
                    {[
                      'Unlimited Workflows',
                      '50,000+ Tasks / month',
                      'Custom Integrations',
                      'Dedicated Success Manager',
                      'SLA-backed Support'
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-3 text-left">
                        <CheckIcon className="w-[18px] h-[18px] text-[#00A859] shrink-0" strokeWidth={2.5} />
                        <span className="font-sans text-[14.5px] text-[#333333] font-normal leading-snug">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: FAQ ━ ━ ━ ━  */}
        <Section id="faq" className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[680px] mx-auto px-[24px]">
            <motion.div variants={fadeUp} className="text-center mb-[52px]">
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A', marginBottom: '10px' }}>
                Common questions
              </h2>
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: '16px', color: '#6B6B6B', lineHeight: 1.6 }}>
                Everything you need to know about Scouto
              </p>
            </motion.div>

            <div className="flex flex-col">
              {faqs.map((faq, i) => (
                <motion.div key={i} variants={fadeUp} className="border-b border-black/[0.08] overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full text-left py-5 flex items-center justify-between gap-4">
                    <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '16px', letterSpacing: '-0.02em', color: '#0A0A0A' }}>{faq.q}</span>
                    <motion.div
                      animate={{ rotate: openFaq === i ? 45 : 0 }}
                      transition={springs.snappy}
                      className="flex-shrink-0 w-6 h-6 rounded-full bg-black/[0.06] flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3 text-[#0A0A0A]" strokeWidth={2.5} />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#6B6B6B', lineHeight: 1.65, paddingBottom: '20px' }}>
                          {faq.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: FOOTER CTA ━ ━ ━ ━  */}
        <Section className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[640px] mx-auto px-[24px] text-center">
            <motion.h2 variants={fadeUp} className="mb-4"
              style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A' }}>
              Stop hunting.<br />Start converting.
            </motion.h2>
            <motion.p variants={fadeUp} className="mb-10" style={{ fontFamily: 'var(--font-inter)', fontSize: '17px', color: '#6B6B6B', lineHeight: 1.65 }}>
              Join founders using Scouto to find warm leads on Reddit every single day.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/signup" className="w-full sm:w-auto bg-[#0A0A0A] hover:bg-[#222] text-white text-[15px] font-[600] px-8 py-4 rounded-full transition-colors duration-150 shadow-[0_2px_12px_rgba(0,0,0,0.15)] flex items-center justify-center gap-2">
                Start for free <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </Link>
              <Link href="#how-it-works" className="w-full sm:w-auto bg-transparent border border-black/[0.10] hover:bg-black/[0.04] text-[#0A0A0A] text-[15px] font-[500] px-8 py-4 rounded-full transition-colors duration-150 flex items-center justify-center">
                See how it works
              </Link>
            </motion.div>
          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: FOOTER ━ ━ ━ ━  */}
        <footer className="bg-[#0A0A0A] text-white py-20 px-6">
          <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4" style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.025em' }}>
                <Target className="w-4.5 h-4.5 text-[#0A84FF]" strokeWidth={2.2} />
                Scouto
              </div>
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.65 }}>
                Find your customers where they're already talking.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-8 md:col-span-2">
              {[
                {
                  label: 'Product',
                  links: [
                    { name: 'Features', href: '#features' },
                    { name: 'Pricing', href: '#pricing' },
                    { name: 'How it Works', href: '#how-it-works' },
                  ],
                },
                {
                  label: 'Company',
                  links: [
                    { name: 'About', href: '/about' },
                    { name: 'Contact', href: '/contact' },
                  ],
                },
                {
                  label: 'Legal',
                  links: [
                    { name: 'Privacy', href: '/privacy' },
                    { name: 'Terms', href: '/terms' },
                  ],
                },
              ].map(({ label, links }) => (
                <div key={label}>
                  <div style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div className="flex flex-col gap-3">
                    {links.map(({ name, href }) => (
                      <Link key={name} href={href} style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: 'rgba(255,255,255,0.38)' }} className="hover:text-white transition-colors duration-150">{name}</Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="md:col-span-1">
              <div style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stay in the loop</div>
              <div className="flex gap-2">
                <input type="email" placeholder="your@email.com" className="bg-white/[0.07] border border-white/[0.10] rounded-xl px-4 py-2.5 text-[14px] text-white placeholder-white/25 focus:outline-none focus:border-white/25 w-full transition-colors" />
                <button className="bg-white text-black px-4 py-2.5 rounded-xl text-[13px] font-[700] hover:bg-surface-secondary/90 transition-colors duration-150 whitespace-nowrap">Subscribe</button>
              </div>
            </div>
          </div>
          <div className="max-w-[1200px] mx-auto border-t border-white/[0.07] pt-7 flex items-center justify-between">
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: 'rgba(255,255,255,0.25)' }}>© 2026 Scouto. All rights reserved.</div>
          </div>
        </footer>

      </div>
    </div>
  )
}
