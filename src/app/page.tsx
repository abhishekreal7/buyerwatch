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
  ChevronRight
} from 'lucide-react'
import { springs, staggers } from '@/lib/motion'
import EyebrowBadge from '@/components/EyebrowBadge'
import { StickyFeatureScroll } from '@/components/StickyFeatureScroll'


// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
const platformData = [
  { name: 'Reddit', count: 847, color: '#FF6B35' },
  { name: 'Bluesky', count: 312, color: '#0085FF' }
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
  { q: 'What is Scouto?', a: 'Scouto is an AI-powered social listening tool that monitors Reddit 24/7 for conversations where people need your product. It scores each match for buyer intent and drafts authentic replies in your voice, so you can engage with warm leads in minutes a day.' },
  { q: 'Will Reddit ban my account?', a: 'No. Scouto never auto-posts. You personally review and post every reply. Authentic human engagement is exactly what Reddit encourages.' },
  { q: 'Does it work for non-SaaS businesses?', a: 'Yes. Scouto works for any business with customers on Reddit — ecommerce, agencies, freelancers, coaches, newsletters, and physical products.' },
  { q: 'How is this different from Google Alerts?', a: "Google Alerts finds mentions of your name after the fact. Scouto finds conversations where people NEED you — even if they've never heard of you — and scores them by how likely they are to buy." },
  { q: 'How accurate is the intent scoring?', a: 'Our AI scores conversations across 4 categories: Buying, Researching, Complaining, and Other. Users report 94% accuracy on the Buying category — the highest-value matches.' },
  { q: 'Can I try it for free?', a: 'Yes. The free plan gives you 2 keywords and 10 thread matches per month — no credit card required.' }
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
  <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-white border border-black/[0.08] rounded-full px-4 py-[6px] shadow-sm mb-5">
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

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-black/[0.08] shadow-lg rounded-xl px-3 py-1.5">
        <span className="text-[12px] font-bold text-[#0A0A0A]">{payload[0].value} found</span>
      </div>
    )
  }
  return null
}

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
const RedditSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
    <circle cx="10" cy="10" r="10" fill="#FF4500"/>
    <path d="M16.67 10a1.46 1.46 0 0 0-2.47-1 7.12 7.12 0 0 0-3.85-1.23l.65-3.08 2.13.45a1 1 0 1 0 1-.97 1 1 0 0 0-.96.68l-2.38-.5a.14.14 0 0 0-.17.1l-.73 3.44a7.14 7.14 0 0 0-3.89 1.23 1.46 1.46 0 1 0-1.61 2.39 2.87 2.87 0 0 0 0 .38c0 1.94 2.26 3.51 5.05 3.51s5.05-1.57 5.05-3.51a2.87 2.87 0 0 0 0-.38 1.46 1.46 0 0 0 .19-2.51zM7.75 11a1 1 0 1 1 1 1 1 1 0 0 1-1-1zm5.5 2.65a3.39 3.39 0 0 1-3.25.38 3.39 3.39 0 0 1-3.25-.38.14.14 0 0 1 .19-.19 3.12 3.12 0 0 0 3.06.35 3.12 3.12 0 0 0 3.06-.35.14.14 0 0 1 .19.19zm-.19-1.65a1 1 0 1 1 1-1 1 1 0 0 1-1 1z" fill="white"/>
  </svg>
)
const BlueskySVG = () => (
  <svg viewBox="0 0 600 530" fill="none" className="w-full h-full">
    <path d="M135.72 44.03C202.216 93.848 273.74 195.17 300 249.49c26.262-54.316 97.782-155.638 164.28-205.46C512.26 8.009 590-19.862 590 68.825c0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.38-3.69-10.832-3.707-7.896-.017-2.936-1.193.516-3.707 7.896-13.714 40.255-67.233 197.356-189.63 71.766-64.444-66.128-34.605-132.256 82.697-152.22-67.108 11.421-142.549-7.449-163.25-81.433C20.156 217.613 10 86.535 10 68.825c0-88.687 77.742-60.816 125.72-24.795z" fill="#0085FF"/>
  </svg>
)
const XSVG = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.732-8.845L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
  </svg>
)

const sourcePlatforms = [
  { name: 'Reddit', sub: 'r/startups + 12,400 more', color: '#FF4500', bg: '#FFF0EB', Icon: RedditSVG, count: '847', textColor: undefined },
  { name: 'Bluesky', sub: '#buildinpublic, #saas', color: '#0085FF', bg: '#EBF4FF', Icon: BlueskySVG, count: '312', textColor: undefined },
  { name: 'X (Twitter)', sub: '#indiehackers, #nocode', color: '#0F1419', bg: '#F0F0F0', Icon: XSVG, count: '523x#0F1419' },
]

const PlatformSourcesWidget = () => {
  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Label */}
      <div style={{ fontSize: '11px', fontFamily: 'var(--font-inter)', fontWeight: 500, letterSpacing: '0.08em', color: '#ADADAD', textTransform: 'uppercase' }}>
        Takes signals from
      </div>

        {/* ━━━━ section separator ━━━━ */}
      <div className="flex items-center gap-8 md:gap-12">
        {/* Reddit */}
        <div className="flex items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity duration-200">
          <div className="w-6 h-6 flex-shrink-0">
            <RedditSVG />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', fontFamily: 'var(--font-inter)', letterSpacing: '-0.01em' }}>Reddit</span>
        </div>

        <span style={{ color: '#D1D1D1', fontSize: '18px' }}>•</span>

        {/* Bluesky */}
        <div className="flex items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity duration-200">
          <div className="w-6 h-6 flex-shrink-0">
            <BlueskySVG />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', fontFamily: 'var(--font-inter)', letterSpacing: '-0.01em' }}>Bluesky</span>
        </div>

        <span style={{ color: '#D1D1D1', fontSize: '18px' }}>•</span>

        {/* X */}
        <div className="flex items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity duration-200">
          <div className="w-[22px] h-[22px] flex-shrink-0 flex items-center justify-center" style={{ color: '#0F1419' }}>
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
            className="bg-white border border-black/[0.06] rounded-[16px] rounded-tl-[4px] p-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)] self-start max-w-[92%]"
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

// Section wrapper that triggers whileInView
function Section({ children, className = '', delay = 0, id }: { children: React.ReactNode; className?: string; delay?: number; id?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
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

        {/* ━━━━ section separator ━━━━ */}
          NAVBAR
        {/* ━━━━ section separator ━━━━ */}
      <motion.nav
        style={{ backgroundColor: navBg, backdropFilter: navBlur, borderColor: navBorder, boxShadow: navShadow }}
        className="fixed top-0 left-0 right-0 z-50 border-b will-change-transform">
        <div className="max-w-7xl mx-auto px-6 h-[60px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity" style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.025em', color: '#0A0A0A' }}>
            <Target className="w-5 h-5 text-[#FF6B35]" strokeWidth={2.2} />
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

        {/* ━━━━ section separator ━━━━ */}
          HERO
        {/* ━━━━ section separator ━━━━ */}
      <section className="hero-mesh relative min-h-[92vh] flex flex-col items-center justify-center px-6 pt-[100px] pb-[80px] overflow-hidden">
        {/* Gradient mesh blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            animate={{ rotate: 360, x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
            className="absolute -top-[10%] -left-[5%] w-[45%] h-[60%] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(255,180,100,0.38) 0%, transparent 68%)', filter: 'blur(40px)' }} />
          <motion.div
            animate={{ rotate: -360, x: [0, -40, 0], y: [0, 30, 0] }}
            transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
            className="absolute -top-[15%] right-0 w-[40%] h-[55%] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(200,150,255,0.28) 0%, transparent 68%)', filter: 'blur(50px)' }} />
          <motion.div
            animate={{ x: [0, 50, -50, 0], y: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 20, ease: "easeInOut" }}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[50%] h-[30%]"
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
            <WordFadeIn text="on Reddit." delay={0.3} />
            <br />
            <span style={{ color: '#9B9B9B', fontWeight: 700 }}>Before anyone else does.</span>
          </h1>

          <p className="max-w-[520px] mb-10" style={{ fontFamily: 'var(--font-inter), sans-serif', fontWeight: 400, fontSize: '17px', lineHeight: 1.65, color: '#6B6B6B' }}>
            Scouto monitors Reddit and Bluesky 24/7, finds high-intent conversations, and organizes your outreach in one focused dashboard.
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

        {/* FEATURES */}


        <Section id="features" className="bg-[#f5f5f5] pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-[24px]">
            <SectionBadge color="#FF6B35" text="Features" />

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
                    { title: '24/7 Keyword Monitoring', body: 'Reddit, Bluesky, and more scanned continuously. Competitor mentions, pain-point keywords, buying signals.' }
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
                <div className="myniq-card p-[28px] relative z-10">
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '20px', letterSpacing: '-0.025em', color: '#0A0A0A', marginBottom: '18px' }}>Buyer Intent Analysis</h4>

                  <div className="bg-[#F5F5F5] rounded-xl p-4 mb-5">
                    <div style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', color: '#ADADAD', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>r/entrepreneur</div>
                    <div style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#0A0A0A', lineHeight: 1.6 }}>&quot;Looking for a Mailchimp alternative that won't break the bank...&quot;</div>
                  </div>

                  <div className="flex flex-col items-center justify-center py-2 mb-4">
                    <GaugeMeter value={94} label="Intent" />
                  </div>

                  <div className="bg-[#D1F2D6]/70 text-[#1A9A3E] px-4 py-2.5 rounded-full text-[11px] font-[700] tracking-[0.04em] uppercase flex items-center justify-center gap-2 mb-5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />High intent — Buying signal
                  </div>

                  <div>
                    <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '11px', letterSpacing: '0.04em', color: '#ADADAD', marginBottom: '10px', textTransform: 'uppercase' }}>Signals detected</div>
                    <div className="flex flex-col gap-2">
                      {['Explicit product request', 'Budget constraint mentioned', 'Comparing alternatives'].map((sig, i) => (
                        <div key={i} className="flex items-center gap-2.5" style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#3A3A3A', lineHeight: 1.5 }}>
                          <svg className="w-4 h-4 text-[#30D158] flex-shrink-0" fill="none" viewBox="0 0 16 16">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
                            <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {sig}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

        {/* ━━━━ section separator ━━━━ */}
            <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[24px]">
              {[
                { Icon: ScanSearch, title: 'Keyword Monitoring', body: 'Set keywords once. We scan Reddit, Bluesky, and more 24/7 while you focus on building.' },
                { Icon: BrainCircuit, title: 'Intent Scoring', body: 'AI scores every match 0-100 for purchase likelihood. Only high-signal leads reach you.' },
                { Icon: MessageSquareText, title: 'AI Reply Drafting', body: 'Authentic, context-aware replies in your voice. Review, edit, post. Takes minutes.' },
                { Icon: Zap, title: 'Triage Queue', body: 'A focused inbox of opportunities, sorted by intent. No noise, no irrelevance.' },
              ].map(({ Icon, title, body }, i) => (
                <motion.div key={i} variants={fadeUp} whileHover={{ y: -6 }} transition={springs.snappy} className="flex flex-col bg-white border border-black/[0.04] p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <FeatureIcon icon={Icon} />
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '16px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '6px' }}>{title}</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>{body}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </Section>

        {/* ━━━━ section separator ━━━━ */}
          MORE FEATURES (Bento Grid)
        {/* ━━━━ section separator ━━━━ */}
        <Section className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-[24px] text-center">
            <SectionBadge color="#0A84FF" text="More Features" />
            <motion.h2 variants={fadeUp} className="mx-auto mb-[52px]"
              style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A', maxWidth: '560px' }}>
              Tools that find warm leads<br />while you sleep
            </motion.h2>

            <div className="flex flex-col gap-[12px] text-left">
              <motion.div variants={staggerContainer} className="grid md:grid-cols-2 gap-[12px]">
        {/* ━━━━ section separator ━━━━ */}
                <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col h-[380px]">
                  <div className="flex-1 flex flex-col justify-center mb-6">
                    {platformData.map((p, i) => (
                      <div key={i} className="w-full mb-5">
                        <div className="flex justify-between mb-2">
                          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', fontWeight: 500, color: '#6B6B6B' }}>{p.name}</span>
                          <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontSize: '13px', fontWeight: 700, color: '#0A0A0A' }}>{p.count.toLocaleString()} matches</span>
                        </div>
                        <div className="h-[7px] bg-[#EEEEEE] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: p.name === 'Reddit' ? '85%' : '37%' }}
                            transition={{ duration: 1.1, delay: i * 0.2, ease: [0.16, 1, 0.3, 1] }}
                            viewport={{ once: true }}
                            className="h-[7px] rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                        </div>
                      </div>
                    ))}
                    <div style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', color: '#CECECE', textAlign: 'center', marginTop: '4px' }}>X, Threads, HN — coming soon</div>
                  </div>
                  <div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '-0.025em', color: '#0A0A0A', marginBottom: '5px' }}>Platform Coverage</h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Which platforms drive the most warm leads for your keywords</p>
                  </div>
                </motion.div>

        {/* ━━━━ section separator ━━━━ */}
                <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col h-[380px]">
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
        {/* ━━━━ section separator ━━━━ */}
                <motion.div variants={fadeUp} whileHover={{ y: -3 }} transition={springs.snappy} className="myniq-card p-[28px] flex flex-col">
                  <div className="flex-1 flex flex-col justify-center w-full py-3">
                    <PlatformSourcesWidget />
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '5px' }}>Multi-Platform Coverage</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Signals from Reddit, Bluesky & X — all in one place, always live.</p>
                </motion.div>

        {/* ━━━━ section separator ━━━━ */}
                <motion.div variants={fadeUp} whileHover={{ y: -3 }} transition={springs.snappy} className="myniq-card p-[28px] flex flex-col">
                  <div className="flex-1 flex flex-col justify-center items-center h-full pt-4">
                    <ChatSimulation />
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '5px' }}>Morning Digest</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Wake up to overnight leads, pre-sorted by intent score.</p>
                </motion.div>

        {/* ━━━━ section separator ━━━━ */}
                <motion.div variants={fadeUp} whileHover={{ y: -3 }} transition={springs.snappy} className="myniq-card p-[28px] flex flex-col">
                  <div className="flex-1 flex flex-col justify-center gap-2.5 mb-6">
                    {[
                      { label: 'Buying', score: '94', dot: '#30D158' },
                      { label: 'Researching', score: '71', dot: '#0A84FF' },
                      { label: 'Complaining', score: '58', dot: '#FF6B35' },
                      { label: 'Other', score: '23x#ADADAD' },
                    ].map((item, i) => (
                      <div key={i} className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-black/[0.04] bg-[#F9F9FB] shadow-[0_1px_2px_rgba(0,0,0,0.015)] transition-all duration-200 hover:border-black/[0.08]">
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

        {/* ━━━━ section separator ━━━━ */}
          ANALYTICS
        {/* ━━━━ section separator ━━━━ */}
        <Section className="bg-[#f5f5f5] pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-[24px] text-center">
            <SectionBadge color="#30D158" text="Analytics" />
            <motion.h2 variants={fadeUp} className="mb-[52px]"
              style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A' }}>
              Turn social noise into<br />clear opportunity
            </motion.h2>

            <motion.div variants={fadeUp} className="myniq-card p-[32px] mb-[72px] text-left">
              <div className="flex gap-10 mb-8">
                {[{ label: 'Found', value: '247' }, { label: 'Drafted', value: '67' }, { label: 'Sent', value: '42' }].map((stat, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: '#ADADAD', textTransform: 'uppercase', marginBottom: '4px' }}>{stat.label}</div>
                    <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontSize: '30px', fontWeight: 800, letterSpacing: '-0.035em', color: '#0A0A0A' }}>{stat.value}</div>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={analyticsData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="foundGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#FF6B35" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#ADADAD', fontFamily: 'Inter' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#ADADAD', fontFamily: 'Inter' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="found" stroke="#FF6B35" strokeWidth={2.5} fill="url(#foundGrad)" dot={false} activeDot={{ r: 4, fill: '#FF6B35', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[20px] text-left">
              {[
                { Icon: MessageSquare, title: 'Conversation Tracking', desc: 'Full context and thread history for every matched conversation.' },
                { Icon: BarChart3, title: 'Intent Distribution', desc: 'Visualize match quality over time. Know if your keywords are dialed in.' },
                { Icon: BellRing, title: 'Instant Alerts', desc: 'Notified the moment a high-intent conversation hits your queue.' },
                { Icon: TrendingUp, title: 'Growth Metrics', desc: 'Watch your organic reach compound as you engage more conversations.' },
              ].map(({ Icon, title, desc }, i) => (
                <motion.div key={i} variants={fadeUp} className="flex flex-col">
                  <FeatureIcon icon={Icon} />
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '15px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '5px' }}>{title}</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>{desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </Section>

        {/* ━━━━ section separator ━━━━ */}
          SOCIAL PROOF
        {/* ━━━━ section separator ━━━━ */}
        <Section className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div variants={fadeUp} className="text-center mb-[64px]">
              <SectionBadge color="#FF6B35" text="From the community" />
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

        {/* ━━━━ section separator ━━━━ */}
          HOW IT WORKS
        {/* ━━━━ section separator ━━━━ */}
        <Section id="how-it-works" className="bg-[#f5f5f5] pt-[120px] pb-[120px]">
          <div className="max-w-[1100px] mx-auto px-[24px]">
            <div className="text-center mb-[64px]">
              <SectionBadge color="#FF6B35" text="How It Works" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(36px, 4vw, 54px)', letterSpacing: '-0.045em', lineHeight: 1.05, color: '#0A0A0A' }}>
                Simplify organic growth<br />step by step
              </h2>
            </div>

            <motion.div variants={fadeUp} className="myniq-card p-[48px] bg-white relative">
              <div className="relative">
                {/* Connecting line passing through center of step dots */}
                <div className="absolute top-[5px] left-[8px] right-[calc(33.3%+8px)] h-[1.5px] bg-black/[0.06] hidden md:block z-0" />

                <div className="grid md:grid-cols-3 gap-12 mb-6 relative z-10">
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
                      Competitor names, pain points, buying signals. We monitor Reddit and Bluesky 24/7, automatically.
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#BF5AF2] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#8E2DE2] bg-[#BF5AF2]/10 border border-[#BF5AF2]/15">
                      02 | Score
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>
                      AI scores every match
                    </h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>
                      Each conversation gets a Buyer Intent Score. Only high-signal leads reach your queue.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#0A84FF] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#0062CC] bg-[#0A84FF]/10 border border-[#0A84FF]/15">
                      03 | Engage
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>
                      Review and reply
                    </h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>
                      Read the AI draft, edit if needed, post it. Done in minutes, not hours.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-black/[0.06] pt-8 mt-12 flex flex-col sm:flex-row items-center justify-between gap-5">
                <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '-0.025em', color: '#0A0A0A' }}>
                  Automation powered by smart AI
                </span>
                <Link href="/signup" className="flex items-center gap-2 bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-[600] px-8 py-3.5 rounded-full transition-all duration-200 shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                  Start 14-Day Free Trial
                </Link>
              </div>
            </motion.div>
          </div>
        </Section>

        {/* ━━━━ section separator ━━━━ */}
          STICKY FEATURE SCROLL
        {/* ━━━━ section separator ━━━━ */}
        <StickyFeatureScroll />

        {/* ━━━━ section separator ━━━━ */}
          PRICING
        {/* ━━━━ section separator ━━━━ */}
        <Section id="pricing" className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[920px] mx-auto px-[24px]">
            <motion.div variants={fadeUp} className="text-center mb-[36px]">
              <SectionBadge color="#FF6B35" text="Pricing" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A' }}>
                Simple, honest pricing
              </h2>
            </motion.div>

            {/* Toggle */}
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 mb-8">
              <span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', fontWeight: 500, color: !isYearly ? '#0A0A0A' : '#ADADAD' }}>Monthly</span>
              <button onClick={() => setIsYearly(!isYearly)} className="w-[48px] h-[26px] rounded-full relative transition-colors duration-200 cursor-pointer" style={{ background: '#0A0A0A' }} aria-label="Toggle yearly billing">
                <motion.div
                  className="w-[18px] h-[18px] bg-white rounded-full absolute top-[4px] shadow-sm"
                  animate={{ x: isYearly ? 26 : 4 }}
                  transition={springs.snappy}
                />
              </button>
              <span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', fontWeight: 500, color: isYearly ? '#0A0A0A' : '#ADADAD' }}>Yearly</span>
              <AnimatePresence>
                {isYearly && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={springs.snappy}
                    className="bg-[#FFCCBA] text-[#0A0A0A] text-[11px] font-[800] px-3 py-1 rounded-full tracking-[0.02em] uppercase"
                  >
                    Save 20%
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.div variants={staggerContainer} className="grid md:grid-cols-2 gap-[12px] mb-[12px]">
              {/* Free */}
              <motion.div variants={fadeUp} whileHover={{ y: -6 }} transition={springs.snappy} className="myniq-card p-[36px] flex flex-col">
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 500, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '14px' }}>Free</div>
                <div className="flex items-baseline mb-3">
                  <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '60px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A' }}>$0</span>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#ADADAD', marginLeft: '6px' }}>/month</span>
                </div>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6, marginBottom: '24px' }}>Test the waters. No commitment.</p>
                <Link href="/signup" className="w-full bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-[600] text-center px-6 py-3.5 rounded-full transition-colors duration-150 mb-7 block">
                  Get Started Free
                </Link>
                <div className="flex flex-col gap-3.5">
                  {['2 keywords', '10 threads/month', 'Basic intent scoring', 'Manual reply drafting'].map((f) => (
                    <div key={f} className="flex items-center gap-3"><Check /><span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#3A3A3A' }}>{f}</span></div>
                  ))}
                </div>
              </motion.div>

              {/* Starter */}
              <motion.div variants={fadeUp} whileHover={{ y: -6 }} transition={springs.snappy} className="myniq-card p-[36px] flex flex-col">
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 500, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '14px' }}>Starter</div>
                <div className="flex items-baseline mb-3">
                  <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '60px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A' }}>${isYearly ? '15' : '19'}</span>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#ADADAD', marginLeft: '6px' }}>/month</span>
                </div>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6, marginBottom: '24px' }}>For founders doing serious organic outreach.</p>
                <Link href="/signup" className="w-full bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-[600] text-center px-6 py-3.5 rounded-full transition-colors duration-150 mb-7 block">
                  Get Started
                </Link>
                <div className="flex flex-col gap-3.5">
                  {['5 keywords', '100 threads/month', '50 AI drafts/month', 'Intent scoring', 'Daily email digest'].map((f) => (
                    <div key={f} className="flex items-center gap-3"><Check /><span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#3A3A3A' }}>{f}</span></div>
                  ))}
                </div>
              </motion.div>

        {/* ━━━━ section separator ━━━━ */}
              <motion.div variants={fadeUp}
                className="rounded-[20px] border border-black/[0.07] p-[36px] flex flex-col relative overflow-hidden"
                style={{ boxShadow: 'var(--shadow-card)', background: 'linear-gradient(130deg, rgba(255,175,115,0.10) 0%, rgba(255,200,160,0.06) 25%, #ffffff 55%)' }}
              >
                <div className="absolute top-0 right-0 w-[160px] h-[160px] rounded-full pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgba(255,145,70,0.14) 0%, transparent 70%)', filter: 'blur(16px)', transform: 'translate(30%, -30%)' }} />
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '18px', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #FF6B35, #FF9F0A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '14px' }}>Pro</div>
                <div className="flex items-baseline mb-3">
                  <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '60px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A' }}>${isYearly ? '39' : '49'}</span>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#ADADAD', marginLeft: '6px' }}>/month</span>
                </div>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6, marginBottom: '24px' }}>For founders who want to dominate organic Reddit growth.</p>
                <Link href="/signup" className="w-full bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-[600] text-center px-6 py-3.5 rounded-full transition-colors duration-150 mb-7 block">
                  Get Started Now
                </Link>
                <div className="flex flex-col gap-3.5">
                  {['20 keywords', 'Unlimited threads', 'Unlimited AI drafts', 'Advanced intent scoring', 'Subreddit targeting', 'Reply analytics', 'Weekly report'].map((f) => (
                    <div key={f} className="flex items-center gap-3"><Check /><span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#3A3A3A' }}>{f}</span></div>
                  ))}
                </div>
              </motion.div>

              {/* Agency */}
              <motion.div variants={fadeUp} className="myniq-card p-[36px] flex flex-col">
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 500, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '14px' }}>Agency</div>
                <div className="flex items-baseline mb-3">
                  <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '60px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A' }}>${isYearly ? '119' : '149'}</span>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#ADADAD', marginLeft: '6px' }}>/month</span>
                </div>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6, marginBottom: '24px' }}>For agencies managing multiple client brands.</p>
                <Link href="/signup" className="w-full bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-[600] text-center px-6 py-3.5 rounded-full transition-colors duration-150 mb-7 block">
                  Contact Sales
                </Link>
                <div className="flex flex-col gap-3.5">
                  {['Unlimited keywords', 'Unlimited threads', 'Unlimited AI drafts', '5 client workspaces', 'White-label reports', 'Priority support'].map((f) => (
                    <div key={f} className="flex items-center gap-3"><Check /><span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#3A3A3A' }}>{f}</span></div>
                  ))}
                </div>
              </motion.div>
            </motion.div>

            {/* Enterprise */}
            <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col md:flex-row items-center justify-between gap-5">
              <div>
                <h3 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.025em', color: '#0A0A0A', marginBottom: '3px' }}>Need enterprise scale?</h3>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B' }}>Custom limits, SLAs, and white-glove onboarding.</p>
              </div>
              <Link href="mailto:sales@scouto.com" className="flex items-center gap-2 bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-[600] px-7 py-3.5 rounded-full transition-colors duration-150 whitespace-nowrap">
                Talk to us <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </Link>
            </motion.div>
          </div>
        </Section>

        {/* ━━━━ section separator ━━━━ */}
          FAQ
        {/* ━━━━ section separator ━━━━ */}
        <Section id="faq" className="bg-[#f5f5f5] pt-[100px] pb-[100px]">
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

        {/* ━━━━ section separator ━━━━ */}
          FOOTER CTA
        {/* ━━━━ section separator ━━━━ */}
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

        {/* ━━━━ section separator ━━━━ */}
          FOOTER
        {/* ━━━━ section separator ━━━━ */}
        <footer className="bg-[#0A0A0A] text-white py-20 px-6">
          <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4" style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.025em' }}>
                <Target className="w-4.5 h-4.5 text-[#FF6B35]" strokeWidth={2.2} />
                Scouto
              </div>
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.65 }}>
                Find your customers where they're already talking.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-8 md:col-span-2">
              {[
                { label: 'Product', links: ['Features', 'Pricing', 'How it Works'] },
                { label: 'Company', links: ['About', 'Blog', 'Contact'] },
                { label: 'Legal', links: ['Privacy', 'Terms'] },
              ].map(({ label, links }) => (
                <div key={label}>
                  <div style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div className="flex flex-col gap-3">
                    {links.map((l) => (
                      <Link key={l} href="#" style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: 'rgba(255,255,255,0.38)' }} className="hover:text-white transition-colors duration-150">{l}</Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="md:col-span-1">
              <div style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stay in the loop</div>
              <div className="flex gap-2">
                <input type="email" placeholder="your@email.com" className="bg-white/[0.07] border border-white/[0.10] rounded-xl px-4 py-2.5 text-[14px] text-white placeholder-white/25 focus:outline-none focus:border-white/25 w-full transition-colors" />
                <button className="bg-white text-black px-4 py-2.5 rounded-xl text-[13px] font-[700] hover:bg-white/90 transition-colors duration-150 whitespace-nowrap">Subscribe</button>
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
