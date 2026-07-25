'use client'
import React, { useState, useRef } from 'react'
import { motion, AnimatePresence, useInView, useScroll, useTransform } from 'framer-motion'
import { RadialGauge } from '@/components/RadialGauge'
import Link from 'next/link'
import {
  Target, Plus, Minus,
  ChevronRight, Radar, Layers
} from 'lucide-react'
import { springs } from '@/lib/motion'
import EyebrowBadge from '@/components/EyebrowBadge'
import { StickyFeatureScroll } from '@/components/StickyFeatureScroll'
import {
  CustomKeywordRulesIcon,
  ToneMatchingIcon,
  ApprovalQueueIcon,
  DailyDigestIcon,
  InsightsHubIcon,
  ConfidenceEngineIcon
} from '@/components/CustomFeatureIcons'
import {
  CacheLiveWaveChart,
  Avatar,
  InfraLiveQueue,
  IntentTextCycler,
  NumberTicker,
  PlatformSourcesWidget,
  PrefilterSignalMarquee,
  SectionBadge,
  WordFadeIn,
} from '@/components/landing/HomeVisuals'
import {
  BentoPlatformSourcesWidget,
  BentoTrafficWidget,
  ChatSimulation,
  LeadDiscoveryWidget,
  RetryStackAlertCycler,
} from '@/components/landing/HomeWidgets'
import { LandingFooter } from '@/components/landing/LandingFooter'


// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as any } }
}
const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
}

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
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
            Start for free
          </Link>
        </div>
      </motion.nav>

      {/* ━ ━ ━ ━  section separator: HERO ━ ━ ━ ━  */}
      <section className="hero-mesh relative flex flex-col items-center justify-center px-6 pt-[100px] pb-[40px] overflow-hidden">
        {/* Subtle neutral depth — no colored blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] pointer-events-none z-0"
            style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(0,0,0,0.025) 0%, transparent 60%)' }} />
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
            Monitor Reddit and Bluesky on a predictable plan cadence, detect high-intent conversations, and draft personalized replies for review.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
            <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.975 }} transition={springs.snappy}>
              <Link
                href="/signup"
                className="w-full sm:w-auto bg-[#0A0A0A] text-white text-[15px] font-[600] flex items-center justify-center px-8 py-[14px] rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-[#1C1C1E] transition-colors duration-200"
              >
                Start for free
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.975 }} transition={springs.snappy}>
              <Link href="#how-it-works" className="w-full sm:w-auto px-7 py-[14px] rounded-full font-[500] text-[15px] text-[#0A0A0A] hover:bg-black/[0.04] border border-black/[0.10] flex items-center justify-center gap-2 transition-colors duration-200">
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
                  <span className="text-[12px] font-bold text-[#FF3B30] uppercase tracking-wider">0{i + 1}</span>
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
                      Competitor names, pain points, and buying signals. Scouto monitors Reddit and Bluesky on your plan&apos;s polling cadence.
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
                      Read the draft, edit if needed, and send. Manual review is the default; eligible paid accounts can opt into guarded auto-send later.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-black/[0.06] pt-8 mt-12 flex flex-col sm:flex-row items-center justify-between gap-5">
                <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '-0.025em', color: '#0A0A0A' }}>
                  Acquire buyers organically
                </span>
                <Link href="/signup" className="flex items-center gap-2 bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-[600] px-8 py-3.5 rounded-full transition-all duration-200 shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                  Start for free
                </Link>
              </div>
            </motion.div>
          </div>
        </Section>

        {/* FEATURES */}


        <Section id="product-overview" className="bg-white pt-[50px] pb-[100px]">
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
                    { title: 'AI Reply Drafting', body: 'Context-aware replies based on your product details and voice examples. Review, edit, and send.' },
                    { title: 'Scheduled Keyword Monitoring', body: 'Reddit and Bluesky are monitored at the polling interval included with your plan.' }
                  ].map((item, i) => (
                    <motion.div key={i} variants={fadeUp} className="border-b border-black/[0.07] overflow-hidden">
                      <button
                        onClick={() => setActiveAccordion(i)}
                        className="w-full text-left py-6 flex items-center justify-between gap-4"
                        aria-expanded={activeAccordion === i}
                        aria-controls={`feature-panel-${i}`}
                        id={`feature-trigger-${i}`}
                      >
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
                            id={`feature-panel-${i}`}
                            role="region"
                            aria-labelledby={`feature-trigger-${i}`}
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
                <div className="myniq-card p-[28px] relative z-10 flex flex-col h-[400px]">
                  <LeadDiscoveryWidget />
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
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Signals from Reddit and Bluesky — in one place and continuously refreshed.</p>
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
          <div className="max-w-[1140px] mx-auto px-[24px] text-center">
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
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-14 gap-y-20 text-center"
            >
              {[
                { icon: CustomKeywordRulesIcon, title: 'Custom Keyword Rules', body: 'Exact-match, negative keywords, subreddit filters. You decide what counts as a lead.' },
                { icon: ToneMatchingIcon, title: 'Tone & Language AI', body: "Detects post language automatically and drafts authentic, natural replies in over 30 languages." },
                { icon: ApprovalQueueIcon, title: 'Approval Queue', body: 'Nothing posts without you clicking approve first. Full control, every time.' },
                { icon: DailyDigestIcon, title: 'Scheduled Monitoring', body: 'Background workers scan Reddit and Bluesky at the polling interval included with your plan.' },
                { icon: InsightsHubIcon, title: 'Insights Hub', body: "Get clear reports on activity, progress, and bottlenecks—instantly." },
                { icon: ConfidenceEngineIcon, title: 'Confidence Engine', body: 'AI intent scoring filters noise to auto-post high-confidence matches.' },
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
                    {/* Ultra-delicate thin vector stroke matching Framer reference site */}
                    <div style={{ display: 'inline-flex', lineHeight: 0 }} className="animated-icon-wrapper">
                      <Icon size={64} color="#0A0A0A" strokeWidth={0.85} style={{ display: 'block' }} />
                    </div>
                  </motion.div>
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 500, fontSize: '19px', letterSpacing: '-0.01em', color: '#111111', marginBottom: '6px' }}>{title}</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14.5px', color: '#666666', lineHeight: 1.55, maxWidth: '290px' }}>{body}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </Section>





        {/* ━ ━ ━ ━  section separator: STICKY FEATURE SCROLL (HOW IT WORKS) ━ ━ ━ ━  */}
        <div id="workflow">
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
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '56px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A', marginBottom: '6px' }}>0–100</div>
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '3px' }}>Intent confidence score</div>
                <div style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: '#ADADAD' }}>for every qualified opportunity</div>
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
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '56px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A', marginBottom: '6px' }}>4</div>
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A' }}>Intent classifications</div>
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

        {/* ━ ━ ━ ━  section separator: INFRASTRUCTURE (FintechX Bento Grid Style) ━ ━ ━ ━  */}
        <Section className="bg-[#F8F8FA] pt-[120px] pb-[140px] border-t border-black/[0.06] relative overflow-hidden">
          <div className="max-w-[1200px] mx-auto px-[24px]">

            {/* Header: Left Aligned Title + Right Description & CTA */}
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
              variants={staggerContainer}
              className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-[56px]"
            >
              <div>
                <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-white border border-black/[0.08] rounded-full px-3.5 py-[5px] shadow-sm mb-4">
                  <span className="w-[7px] h-[7px] rounded-full flex-shrink-0 bg-[#30D158] animate-pulse" />
                  <span className="text-[12px] font-semibold text-[#0A0A0A] tracking-[0.03em] uppercase" style={{ fontFamily: 'var(--font-inter)' }}>
                    System Architecture
                  </span>
                </motion.div>
                <motion.h2
                  variants={fadeUp}
                  style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(36px, 4.2vw, 56px)', letterSpacing: '-0.04em', lineHeight: 1.08, color: '#0A0A0A', maxWidth: '600px' }}
                >
                  Everything you need to monitor intent confidently
                </motion.h2>
              </div>

              <motion.div variants={fadeUp} className="flex flex-col items-start lg:items-end gap-4 max-w-[360px]">
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#6B6B6B', lineHeight: 1.6 }} className="lg:text-right">
                  Professional worker infrastructure designed for real-time social intent scanning under scale.
                </p>
                <a
                  href="/signup"
                  className="bg-[#0A0A0A] hover:bg-[#222] text-white text-[13.5px] font-semibold px-6 py-3 rounded-full flex items-center gap-2.5 transition-all duration-200 shadow-[0_4px_14px_rgba(0,0,0,0.15)] group"
                >
                  <span>Explore architecture</span>
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center transition-transform group-hover:translate-x-0.5">
                    <ChevronRight className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                  </div>
                </a>
              </motion.div>
            </motion.div>

            {/* FintechX 5-Card Bento Grid */}
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              variants={staggerContainer}
              className="grid lg:grid-cols-12 gap-5 items-stretch"
            >

              {/* ── TOP LEFT CARD (4 Cols): Light Gray 3D Pre-Filter ── */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                className="lg:col-span-4 bg-[#EFEFF3] rounded-[28px] p-7 md:p-8 flex flex-col justify-between min-h-[380px] relative overflow-hidden group cursor-default"
              >
                <div className="text-center">
                  <h3 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '20px', letterSpacing: '-0.02em', color: '#0A0A0A' }}>
                    Deterministic Pre-filter
                  </h3>
                </div>

                {/* Animated 3D Funnel Icon + Infinite Signal Marquee */}
                <PrefilterSignalMarquee />

                <div className="text-center">
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: '#6B6B6B', lineHeight: 1.5 }}>
                    Zero-cost filter eliminates chatter before model calls.
                  </p>
                </div>
              </motion.div>

              {/* ── TOP MIDDLE CARD (4 Cols): Scenic Glassmorphic Subreddit Cache ── */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                className="lg:col-span-4 rounded-[28px] p-7 md:p-8 flex flex-col justify-between min-h-[380px] relative overflow-hidden group cursor-default"
                style={{
                  background: 'linear-gradient(135deg, #78B3EA 0%, #A4D4FF 40%, #BFE5A2 100%)',
                }}
              >
                <div className="text-center relative z-10">
                  <h3 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '20px', letterSpacing: '-0.02em', color: '#0A0A0A' }}>
                    Subreddit Redis Cache
                  </h3>
                </div>

                {/* Live Animated SVG Wave Chart Window */}
                <CacheLiveWaveChart />

                <div className="text-center text-[12.5px] font-medium text-[#0A0A0A]/80 relative z-10">
                  Shared feed responses prevent API rate limits under scale.
                </div>
              </motion.div>

              {/* ── TOP RIGHT CARD (4 Cols, Spans Height): Pitch Black BUYING Intent ── */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                className="lg:col-span-4 bg-[#0A0A0A] rounded-[28px] p-8 md:p-9 flex flex-col justify-between min-h-[380px] relative overflow-hidden group cursor-default"
              >
                <div className="text-center">
                  <span className="text-[12px] font-semibold text-[#8E8E93] uppercase tracking-wider block mb-2" style={{ fontFamily: 'var(--font-inter)' }}>
                    Intent Classification
                  </span>
                  <h3 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '20px', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                    AI-powered scoring
                  </h3>
                </div>

                {/* Animated Intent Text Cycler (BUYING / HIGH INTENT / HOT LEAD) */}
                <IntentTextCycler />

                <div className="text-center">
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '13.5px', color: '#A1A1AA', lineHeight: 1.5 }}>
                    Real-time buying intent data and predictive scoring.
                  </p>
                </div>
              </motion.div>

              {/* ── BOTTOM LEFT CARD (8 Cols): Wide Sky-Gradient Queue Isolation ── */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -6, scale: 1.005 }}
                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                className="lg:col-span-8 rounded-[28px] p-8 md:p-10 flex flex-col justify-between min-h-[380px] relative overflow-hidden group cursor-default"
                style={{
                  background: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 50%, #F0F9FF 100%)',
                }}
              >
                <div className="mb-6 max-w-[480px]">
                  <h3 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '24px', letterSpacing: '-0.025em', color: '#0A0A0A', marginBottom: '8px' }}>
                    Background Queue Isolation
                  </h3>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14.5px', color: '#475569', lineHeight: 1.6 }}>
                    Seven decoupled BullMQ worker threads run Reddit, Bluesky, scoring, and reply delivery independently. High memory load on one worker never impacts the rest.
                  </p>
                </div>

                {/* Floating Live Queue Window */}
                <div className="mt-2 bg-white/90 backdrop-blur-md rounded-2xl p-2 border border-white shadow-[0_12px_32px_rgba(0,0,0,0.06)]">
                  <InfraLiveQueue />
                </div>
              </motion.div>

              {/* ── BOTTOM RIGHT CARD (4 Cols): Soft Light Smart Alert Retry ── */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                className="lg:col-span-4 bg-[#EFEFF3] rounded-[28px] p-7 md:p-8 flex flex-col justify-between min-h-[380px] relative overflow-hidden group cursor-default"
              >
                <div className="text-center">
                  <h3 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '20px', letterSpacing: '-0.02em', color: '#0A0A0A' }}>
                    Smart Retry Recovery
                  </h3>
                </div>

                {/* Animated Alert Stack Cycler */}
                <RetryStackAlertCycler />

                <div className="text-center">
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: '#6B6B6B', lineHeight: 1.5 }}>
                    Network timeouts automatically recover before triggering Sentry alerts.
                  </p>
                </div>
              </motion.div>

            </motion.div>

          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: BEFORE vs AFTER (FintechX Style Comparison Section) ━ ━ ━ ━  */}
        <Section className="bg-white pt-[100px] pb-[130px] border-t border-black/[0.05] relative overflow-hidden">
          <div className="max-w-[1100px] mx-auto px-[24px]">

            {/* Header Title */}
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
              variants={fadeUp}
              className="text-center mb-16"
            >
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(36px, 4.5vw, 56px)', letterSpacing: '-0.04em', lineHeight: 1.06, color: '#0A0A0A' }}>
                Smarter lead generation<br />starts with real-time data
              </h2>
            </motion.div>

            {/* Main Card Container with Central Emblem Badge */}
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              variants={fadeUp}
              className="relative mt-8"
            >
              {/* Before Scouto / After Scouto Top Label Pills */}
              <div className="flex items-center justify-center gap-16 mb-[-24px] relative z-20">
                <span className="text-[13px] font-semibold text-[#8E8E93] tracking-wide" style={{ fontFamily: 'var(--font-inter)' }}>
                  Before Scouto
                </span>
                <span className="text-[13px] font-semibold text-[#0A0A0A] tracking-wide" style={{ fontFamily: 'var(--font-inter)' }}>
                  After Scouto
                </span>
              </div>

              {/* Central Glowing 3D Emblem Badge */}
              <div className="flex justify-center relative z-30 mb-[-36px]">
                <div className="w-20 h-20 rounded-full bg-gradient-to-b from-[#30D158] to-[#0A0A0A] p-1 shadow-[0_0_36px_rgba(48,209,88,0.45)] flex items-center justify-center relative">
                  <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center border border-white/20">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#30D158" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Pitch-Black Card Surface */}
              <div className="bg-[#0A0A0A] rounded-[36px] p-8 md:p-14 shadow-[0_20px_50px_rgba(0,0,0,0.2)] text-white grid lg:grid-cols-12 gap-10 items-center relative overflow-hidden">
                {/* Background Ambient Glow */}
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full pointer-events-none opacity-20"
                  style={{ background: 'radial-gradient(circle, rgba(48,209,88,0.4) 0%, transparent 70%)' }}
                />

                {/* Left Column: Checkmark Feature List */}
                <div className="lg:col-span-7 flex flex-col justify-center relative z-10">
                  <h3 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(26px, 3vw, 36px)', letterSpacing: '-0.03em', lineHeight: 1.15, color: '#FFFFFF', marginBottom: '28px' }}>
                    Smarter way to find &amp;<br />convert buyers
                  </h3>

                  <div className="flex flex-col gap-4">
                    {[
                      'Get pre-scored intent leads in real time based on buying signals',
                      'Filter out 95% of social chatter before AI model calls',
                      'Duplicate-safe tracking across Reddit and Bluesky',
                      'Make consistent, informed outreach with authentic AI drafts',
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-3.5">
                        <div className="w-5 h-5 rounded-full bg-[#30D158]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#30D158" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <span style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#E4E4E7', lineHeight: 1.5, fontWeight: 500 }}>
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: 2 Stat Callout Cards */}
                <div className="lg:col-span-5 flex flex-col gap-4 relative z-10">
                  <div className="bg-[#131D17] border border-[#30D158]/25 rounded-2xl p-6 flex flex-col gap-1 shadow-inner">
                    <div className="text-[34px] font-black text-white tracking-tight" style={{ fontFamily: 'var(--font-jakarta)' }}>
                      0–100
                    </div>
                    <div className="text-[13px] font-medium text-[#30D158]" style={{ fontFamily: 'var(--font-inter)' }}>
                      Buying-intent confidence score
                    </div>
                  </div>

                  <div className="bg-[#131D17] border border-[#30D158]/25 rounded-2xl p-6 flex flex-col gap-1 shadow-inner">
                    <div className="text-[34px] font-black text-white tracking-tight" style={{ fontFamily: 'var(--font-jakarta)' }}>
                      15m–6h
                    </div>
                    <div className="text-[13px] font-medium text-[#30D158]" style={{ fontFamily: 'var(--font-inter)' }}>
                      Plan-based monitoring cadence
                    </div>
                  </div>
                </div>
              </div>

            </motion.div>

          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: PRICING ━ ━ ━ ━  */}
        <Section id="pricing" className="bg-[#F4F4F6] pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-[24px]">
            <motion.div variants={fadeUp} className="text-center mb-[36px]">
              <SectionBadge color="#0A0A0A" text="Pricing" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A' }}>
                Simple, honest pricing
              </h2>
            </motion.div>

            {/* Toggle */}
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 mb-12">
              <span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', fontWeight: 600, color: !isYearly ? '#0A0A0A' : '#71717A' }}>Monthly</span>
              <button onClick={() => setIsYearly(!isYearly)} className="w-[48px] h-[26px] rounded-full relative transition-colors duration-200 cursor-pointer bg-[#0A0A0A]" aria-label="Toggle yearly billing">
                <motion.div
                  className="w-[18px] h-[18px] bg-white rounded-full absolute top-[4px] shadow-sm"
                  animate={{ x: isYearly ? 26 : 4 }}
                  transition={springs.snappy}
                />
              </button>
              <span style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', fontWeight: 600, color: isYearly ? '#0A0A0A' : '#71717A' }}>Yearly</span>
              <AnimatePresence>
                {isYearly && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={springs.snappy}
                    className="bg-[#E4E4E7] text-[#0A0A0A] text-[11px] font-[800] px-3 py-1 rounded-full tracking-[0.02em] uppercase"
                  >
                    Save 2 months
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.div variants={staggerContainer} className="grid lg:grid-cols-3 gap-6 items-stretch">
              {/* Free / Starter Card */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -3 }}
                transition={springs.snappy}
                className="bg-white rounded-[24px] border border-[#EAEAEC] p-8 flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-sans font-normal text-[20px] tracking-tight text-[#18181B] mb-4">
                    Free
                  </h3>
                  <div className="flex items-baseline mb-4">
                    <span className="font-sans font-bold text-[44px] tracking-[-0.03em] leading-none text-[#18181B]">
                      $0
                    </span>
                    <span className="font-sans text-[14px] text-[#71717A] ml-1.5 font-normal">
                      /per month
                    </span>
                  </div>
                  <p className="font-sans text-[14px] text-[#52525B] font-normal mb-6 leading-relaxed min-h-[40px]">
                    Great for trying out Scouto buyer intent signals and rule monitoring.
                  </p>

                  <Link href="/signup" className="w-full bg-[#0A0A0A] hover:bg-[#27272A] text-white text-[15px] font-medium text-center py-3 rounded-[16px] transition-all duration-150 block mb-6 shadow-sm">
                    Get Started
                  </Link>

                  <div className="w-full border-t border-dotted border-[#E2E2E6] mb-6" />

                  <div className="flex flex-col gap-3.5">
                    {[
                      '1 Active Keyword Rule',
                      'Up to 50 Buyer Intent Signals / mo',
                      'AI Intent Scoring (0–100)',
                      '1-Click Draft Preview (Manual copy/send requires upgrade)',
                      'Reddit & Bluesky Monitoring'
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-left">
                        <svg className="w-[16px] h-[16px] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                          <path d="M13.3332 4L5.99984 11.3333L2.6665 8" stroke="#10A352" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-sans text-[14px] text-[#3F3F46] font-normal leading-snug">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Professional Card (Most Popular Anchor) */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -3 }}
                transition={springs.snappy}
                className="bg-white rounded-[24px] border-2 border-[#0A0A0A] p-8 flex flex-col justify-between relative shadow-xl"
              >
                {/* Most Popular Anchor Badge */}
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#0A0A0A] text-white text-[11px] font-bold px-3.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                  Most Popular
                </div>

                <div>
                  <h3 className="font-sans font-normal text-[20px] tracking-tight text-[#18181B] mb-4">
                    Professional
                  </h3>
                  <div className="flex items-baseline mb-4">
                    <span className="font-sans font-bold text-[44px] tracking-[-0.03em] leading-none text-[#18181B]">
                      ${isYearly ? '39' : '49'}
                    </span>
                    <span className="font-sans text-[14px] text-[#71717A] ml-1.5 font-normal">
                      /per month
                    </span>
                  </div>
                  <p className="font-sans text-[14px] text-[#52525B] font-normal mb-6 leading-relaxed min-h-[40px]">
                    Best for solo founders, freelancers & growing teams.
                  </p>

                  <Link href="/signup" className="w-full bg-[#0A0A0A] hover:bg-[#27272A] text-white text-[15px] font-medium text-center py-3 rounded-[16px] transition-all duration-150 block mb-6 shadow-sm">
                    Get Started
                  </Link>

                  {/* Highlighted Headline Feature for Confidence Engine */}
                  <div className="mb-6 p-3.5 rounded-[14px] bg-[#F4F4F6] border border-[#EAEAEC] text-[13px] font-medium text-[#18181B] leading-snug text-left flex items-start gap-2.5">
                    <span className="text-[#0A0A0A] font-bold text-[14px] leading-none">✦</span>
                    <span>The only tool that learns when it&apos;s safe to auto-send — and when it isn&apos;t.</span>
                  </div>

                  <div className="w-full border-t border-dotted border-[#E2E2E6] mb-6" />

                  <div className="flex flex-col gap-3.5">
                    {[
                      'Everything in Free',
                      '10 Active Keyword Rules',
                      'Up to 1,000 Buyer Intent Signals / mo',
                      '1-Click Automated Posting',
                      'Auto-Send Automation Engine',
                      'Custom Brand Voice Training'
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-left">
                        <svg className="w-[16px] h-[16px] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                          <path d="M13.3332 4L5.99984 11.3333L2.6665 8" stroke="#10A352" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-sans text-[14px] text-[#3F3F46] font-normal leading-snug">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Growth Card (Renamed from Enterprise) */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -3 }}
                transition={springs.snappy}
                className="bg-white rounded-[24px] border border-[#EAEAEC] p-8 flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-sans font-normal text-[20px] tracking-tight text-[#18181B] mb-4">
                    Growth
                  </h3>
                  <div className="flex items-baseline mb-4">
                    <span className="font-sans font-bold text-[44px] tracking-[-0.03em] leading-none text-[#18181B]">
                      ${isYearly ? '119' : '149'}
                    </span>
                    <span className="font-sans text-[14px] text-[#71717A] ml-1.5 font-normal">
                      /per month
                    </span>
                  </div>
                  <p className="font-sans text-[14px] text-[#52525B] font-normal mb-6 leading-relaxed min-h-[40px]">
                    Ideal for scaling teams that need deep automation & maximum signal volume.
                  </p>

                  <Link href="/signup" className="w-full bg-[#0A0A0A] hover:bg-[#27272A] text-white text-[15px] font-medium text-center py-3 rounded-[16px] transition-all duration-150 block mb-6 shadow-sm">
                    Get Started
                  </Link>

                  <div className="w-full border-t border-dotted border-[#E2E2E6] mb-6" />

                  <div className="flex flex-col gap-3.5">
                    {[
                      'Everything in Professional',
                      '50 Active Keyword Rules',
                      'Up to 5,000 Buyer Intent Signals / mo',
                      'Faster discovery — new posts surface sooner',
                      'Subreddit reply conversion & trust analytics',
                      'Dedicated Founder Support'
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-left">
                        <svg className="w-[16px] h-[16px] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                          <path d="M13.3332 4L5.99984 11.3333L2.6665 8" stroke="#10A352" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-sans text-[14px] text-[#3F3F46] font-normal leading-snug">{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 pt-4 border-t border-dashed border-[#E2E2E6]">
                    <Link
                      href="/contact"
                      style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: '#71717A' }}
                      className="hover:text-[#0A0A0A] transition-colors"
                    >
                      Need more? Talk to us →
                    </Link>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* Overage & Custom Limits Messaging */}
            <motion.div variants={fadeUp} className="text-center mt-10">
              <p className="font-sans text-[14px] text-[#71717A]">
                Need more volume or custom limits?{' '}
                <Link href="/signup" className="text-[#0A0A0A] font-medium underline underline-offset-4 hover:text-[#27272A] transition-colors">
                  Upgrade or contact us anytime
                </Link>{' '}
                — no penalty for outgrowing your plan.
              </p>
            </motion.div>
          </div>
        </Section>

        <LandingFooter />

      </div>
    </div>
  )
}
