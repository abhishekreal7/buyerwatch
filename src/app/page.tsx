'use client'
import React, { useState, useRef } from 'react'
import { motion, AnimatePresence, useInView, useScroll, useTransform } from 'framer-motion'
import { RadialGauge } from '@/components/RadialGauge'
import Link from 'next/link'
import {
  Plus, Minus, BadgeCheck, MousePointerClick,
  ChevronRight, SearchCheck, History, Radar, Layers
} from 'lucide-react'
import { springs } from '@/lib/motion'
import EyebrowBadge from '@/components/EyebrowBadge'
import { BrandLogo } from '@/components/BrandLogo'
import { StickyFeatureScroll } from '@/components/StickyFeatureScroll'
import {
  CustomKeywordRulesIcon,
  ToneMatchingIcon,
  ApprovalQueueIcon,
  DailyDigestIcon,
  InsightsHubIcon,
  ConfidenceEngineIcon,
} from '@/components/CustomFeatureIcons'
import {
  NumberTicker,
  PlatformSourcesWidget,
  SectionBadge,
  WordFadeIn,
} from '@/components/landing/HomeVisuals'
import {
  BentoPlatformSourcesWidget,
  BentoTrafficWidget,
  ChatSimulation,
  LeadDiscoveryWidget,
} from '@/components/landing/HomeWidgets'
import { LandingFooter } from '@/components/landing/LandingFooter'
import {
  BeforeAfterTransformation,
  CoreFeatureBento,
} from '@/components/landing/PremiumFeatureSections'
import { PremiumCtaButton } from '@/components/landing/PremiumCtaButton'
import { Reveal } from '@/components/Reveal'


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

  // Navbar scroll animation
  const { scrollY } = useScroll()
  const navBg = useTransform(scrollY, [0, 50], ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.88)'])
  const navBlur = useTransform(scrollY, [0, 50], ['blur(0px)', 'blur(12px)'])
  const navBorder = useTransform(scrollY, [0, 50], ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.06)'])
  const navShadow = useTransform(scrollY, [0, 50], ['none', '0 4px 20px -2px rgba(0,0,0,0.03)'])

  return (
    <div className="landing-page min-h-screen bg-white text-[#0A0A0A] selection:bg-[#0A84FF]/20">

      {/* ━ ━ ━ ━  section separator: NAVBAR ━ ━ ━ ━  */}
      <motion.nav
        style={{ backgroundColor: navBg, backdropFilter: navBlur, borderColor: navBorder, boxShadow: navShadow }}
        className="fixed top-0 left-0 right-0 z-50 border-b will-change-transform">
        <div className="max-w-7xl mx-auto px-6 h-[60px] flex items-center justify-between">
          <Link href="/" className="flex items-center hover:opacity-90 transition-opacity">
            <BrandLogo size="md" />
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
          <Link
            href="/signup"
            className="rounded-full bg-[#0A0A0A] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_3px_10px_rgba(0,0,0,0.12)] transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-[#222] hover:shadow-[0_5px_14px_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A84FF]/20"
          >
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
              <PremiumCtaButton href="/signup">
                Start for free
              </PremiumCtaButton>
            </motion.div>
            <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.975 }} transition={springs.snappy}>
              <Link href="#how-it-works" className="w-full sm:w-auto px-7 py-[14px] rounded-full font-[500] text-[15px] text-[#0A0A0A] hover:bg-black/[0.04] border border-black/[0.10] flex items-center justify-center gap-2 transition-colors duration-200">
                See how it works
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </motion.div>
          </div>

          <p className="text-[13px] text-[#9B9B9B] font-[450]">Free to start &middot; No credit card &middot; Cancel anytime</p>
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
              <SectionBadge color="#EF4444" text="The Problem" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.04em', lineHeight: 1.1, color: '#0A0A0A' }}>
                Cold outreach arrives without context.
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { title: 'Cold messages are easy to ignore', desc: 'A pitch from a stranger rarely arrives when the buyer is actively looking.' },
                { title: 'Manual search is a time sink', desc: 'Scrolling subreddits and social feeds takes hours you don\'t have.' },
                { title: 'Relevant conversations move quickly', desc: 'Useful threads can disappear beneath newer posts before you know they exist.' }
              ].map((p, i) => (
                <Reveal key={i} delay={i * 0.08} duration={0.7}>
                  <div className="flex flex-col gap-2">
                    <span className="text-[12px] font-bold text-[#EF4444] uppercase tracking-wider">0{i + 1}</span>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', color: '#0A0A0A' }}>{p.title}</h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>{p.desc}</p>
                  </div>
                </Reveal>
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

            <motion.div variants={fadeUp} className="border-y border-black/[0.07] py-[48px] relative">
              <div className="relative">
                {/* Connecting line passing through center of step dots */}
                <div className="absolute top-[5px] left-[8px] right-[calc(25%+8px)] h-[1.5px] bg-black/[0.06] hidden md:block z-0" />

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-6 relative z-10">
                  {/* Step 1 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5101] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#C43E00] bg-[#FF5101]/10 border border-[#FF5101]/15">
                      01 | Monitor
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>
                      Set your keywords
                    </h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>
                      Competitor names, pain points, and buying signals. BuyerWatch monitors Reddit and Bluesky on your plan&apos;s polling cadence.
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#0A84FF] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#0A84FF] bg-[#0A84FF]/10 border border-[#0A84FF]/15">
                      02 | Score
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>
                      AI scores intent
                    </h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>
                      Each post gets a buyer-intent score from 0–100. Qualified posts are saved to your review queue.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#0A84FF] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#0A84FF] bg-[#0A84FF]/10 border border-[#0A84FF]/15">
                      03 | Draft
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '8px' }}>
                      AI drafts a reply
                    </h4>
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.65 }}>
                      BuyerWatch uses your product profile, writing style, tone examples, and the thread context to draft a reply.
                    </p>
                  </div>

                  {/* Step 4 */}
                  <div className="flex flex-col items-start">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5101] mb-4 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] relative z-20" />
                    <div className="inline-flex items-center text-[12px] font-[600] tracking-[-0.01em] px-3.5 py-1.5 rounded-[8px] mb-4 text-[#C43E00] bg-[#FF5101]/10 border border-[#FF5101]/15">
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

              <div className="border-t border-black/[0.06] pt-8 mt-12">
                <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '-0.025em', color: '#0A0A0A' }}>
                  Acquire buyers organically
                </span>
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
                    { title: 'Traceable Attribution', body: 'Optional tracked redirects connect a sent reply to verified clicks, conversion events, and reported revenue in Analytics.' },
                    { title: 'Safeguarded Drafting', body: 'Commercial mentions require an affiliation disclosure, and every draft is checked for promotional language before publishing.' },
                    { title: 'Search-Rank Context', body: 'When Google Custom Search is configured, Reddit opportunities can show a page-one ranking badge in the dashboard.' }
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
                  title: 'Conversation Radar',
                  body: "Track Reddit and Bluesky for configured buying signals on your plan's scan cadence"
                },
                {
                  id: 'gauge',
                  title: 'Intent Priority',
                  body: 'Prioritize each processed conversation with a recorded 0–100 buyer-intent score'
                },
                {
                  id: 'pen',
                  title: 'Contextual Drafting',
                  body: 'Generate review-ready replies from your product profile, tone examples, and the live thread'
                },
                {
                  id: 'layers',
                  title: 'Guarded Delivery',
                  body: 'Layer manual review, content safeguards, and eligible opt-in automation before public sends'
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
                        <path d="M5.64 18.36A9 9 0 1 1 18.36 18.36" />
                        <path d="M12 3v1.5M3 12h1.5M21 12h-1.5M5.64 5.64l1.06 1.06M18.36 5.64l-1.06 1.06" />
                        <motion.line
                          x1="12"
                          y1="12"
                          x2="12"
                          y2="5.5"
                          animate={{ rotate: [-95, 95, -95] }}
                          transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
                          style={{ transformOrigin: '12px 12px', transformBox: 'view-box' }}
                        />
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
              Measure what happens<br />after the reply
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
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Track drafted and sent replies across Reddit and Bluesky</p>
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
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Signals from Reddit and Bluesky in one scheduled monitoring queue.</p>
                </motion.div>

                {/* ━ ━ ━ ━  section separator ━ ━ ━ ━  */}
                <motion.div variants={fadeUp} whileHover={{ y: -3 }} transition={springs.snappy} className="myniq-card p-[28px] flex flex-col">
                  <div className="flex-1 flex flex-col justify-center items-center h-full pt-4">
                    <ChatSimulation />
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '5px' }}>Morning Digest</h4>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: '#6B6B6B', lineHeight: 1.6 }}>Optional email digests summarize new opportunities by intent score.</p>
                </motion.div>

                {/* ━ ━ ━ ━  section separator ━ ━ ━ ━  */}
                <motion.div variants={fadeUp} whileHover={{ y: -3 }} transition={springs.snappy} className="myniq-card p-[28px] flex flex-col">
                  <div className="flex-1 flex flex-col justify-center gap-2.5 mb-6">
                    {[
                      { label: 'Buying', score: '94', dot: '#FF5101' },
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
        <Section className="bg-[#F8F8F8] pt-[140px] pb-[140px]">
          <div className="max-w-[1140px] mx-auto px-[24px] text-center">
            <SectionBadge color="#FF5101" text="Controls & Safeguards" />
            <motion.h2
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeUp}
              className="mb-5 text-[#0A0A0A]"
              style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(44px, 6vw, 68px)', letterSpacing: '-0.04em', lineHeight: 1.05 }}
            >
              Automation earns trust<br />before it acts.
            </motion.h2>
            <motion.p
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeUp}
              className="text-[#6b7280] text-[16px] max-w-[620px] mx-auto mb-20 leading-relaxed"
              style={{ fontFamily: 'var(--font-inter)' }}
            >
              From signal rules to delivery, every stage stays visible, reviewable, and controlled.
            </motion.p>

            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-14 gap-y-20 text-center"
            >
              {[
                { icon: CustomKeywordRulesIcon, title: 'Buying-Signal Rules', body: 'Monitor configured competitor names, pain points, and buying phrases across Reddit and Bluesky.' },
                { icon: ToneMatchingIcon, title: 'Tone-Aware Drafting', body: 'Shape replies with your product profile, writing style, tone examples, and the live thread.' },
                { icon: ApprovalQueueIcon, title: 'Manual Review Queue', body: 'Review and edit drafts before sending, with guarded automation available only to eligible opted-in accounts.' },
                { icon: DailyDigestIcon, title: 'Scheduled Digests', body: 'Receive optional email summaries of newly qualified opportunities, organized by intent score.' },
                { icon: InsightsHubIcon, title: 'Attribution Insights', body: 'Connect sent replies with recorded clicks, conversion events, and reported revenue.' },
                { icon: ConfidenceEngineIcon, title: 'Confidence-Gated Sending', body: 'Use personal review history and community evidence before eligible automation can send.' },
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

        {/* ━ ━ ━ ━  section separator: PRODUCT EVIDENCE ━ ━ ━ ━  */}
        <Section className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div variants={fadeUp} className="text-center mb-[64px]">
              <SectionBadge color="#0A84FF" text="Evidence in the product" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A', marginBottom: '10px' }}>
                Claims you can verify<br />inside your workspace
              </h2>
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: '16px', color: '#6B6B6B', lineHeight: 1.65, maxWidth: '440px', margin: '0 auto' }}>
                BuyerWatch records the evidence behind discovery, sending, attribution, and search visibility.
              </p>
            </motion.div>

            <motion.div variants={staggerContainer} className="grid md:grid-cols-3 gap-[12px] auto-rows-min">
              {/* Attribution */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] md:col-span-2">
                <MousePointerClick className="w-7 h-7 text-[#0A84FF] mb-4" strokeWidth={1.5} />
                <h3 className="text-[18px] font-bold tracking-[-0.02em] mb-2">Reply-level attribution</h3>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#6B6B6B', lineHeight: 1.7 }}>
                  Optional tracked redirects record verified clicks, then forward readers to your business URL with the referral ID preserved for conversion reporting.
                </p>
              </motion.div>

              {/* Attribution path */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col justify-end min-h-[200px]">
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '40px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A', marginBottom: '8px' }}>Click → sale</div>
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A', marginBottom: '3px' }}>Attribution path</div>
                <div style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: '#9B9B9B' }}>with optional revenue reporting</div>
              </motion.div>

              {/* Rank context */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col justify-between min-h-[190px]">
                <div>
                  <SearchCheck className="w-6 h-6 text-[#0A84FF] mb-3" strokeWidth={1.5} />
                  <h3 className="text-[17px] font-bold tracking-[-0.02em] mb-2">Google rank context</h3>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#0A0A0A', lineHeight: 1.65, marginBottom: '14px' }}>
                    When Google Custom Search is configured, page-one Reddit threads receive a visible dashboard badge.
                  </p>
                </div>
                <span className="text-[12px] font-semibold text-[#9B9B9B]">Optional provider capability</span>
              </motion.div>

              {/* Intent score */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col justify-end min-h-[190px]">
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: '56px', letterSpacing: '-0.045em', lineHeight: 1, color: '#0A0A0A', marginBottom: '6px' }}>0–100</div>
                <div style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '17px', letterSpacing: '-0.02em', color: '#0A0A0A' }}>Recorded intent score</div>
              </motion.div>

              {/* Audit trail */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] flex flex-col justify-between min-h-[190px]">
                <div>
                  <History className="w-6 h-6 text-[#0A84FF] mb-3" strokeWidth={1.5} />
                  <h3 className="text-[17px] font-bold tracking-[-0.02em] mb-2">Send audit history</h3>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#0A0A0A', lineHeight: 1.65, marginBottom: '14px' }}>
                    Manual, automated, failed, and reconciliation-required sends keep their trigger and outcome.
                  </p>
                </div>
                <span className="text-[12px] font-semibold text-[#9B9B9B]">Permalink and failure state included</span>
              </motion.div>

              {/* Evidence summary */}
              <motion.div variants={fadeUp} className="myniq-card p-[28px] md:col-span-3">
                <BadgeCheck className="w-7 h-7 text-[#0A84FF] mb-4" strokeWidth={1.5} />
                <h3 className="text-[18px] font-bold tracking-[-0.02em] mb-2">Evidence stays attached to the opportunity</h3>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '16px', color: '#0A0A0A', lineHeight: 1.7, marginBottom: '20px', maxWidth: '680px' }}>
                  The dashboard keeps the original thread, intent reasoning, draft status, optional rank signal, send outcome, and attribution events together so reported performance can be inspected rather than inferred.
                </p>
                <span className="text-[13px] font-semibold text-[#6B6B6B]">No invented testimonial or outcome figures.</span>
              </motion.div>
            </motion.div>
          </div>
        </Section>

        <CoreFeatureBento />

        <BeforeAfterTransformation />


        {/* ━ ━ ━ ━  section separator: PRICING ━ ━ ━ ━  */}
        <Section id="pricing" className="bg-[#F5F5F5] pt-[100px] pb-[100px]">
          <div className="max-w-[1200px] mx-auto px-[24px]">
            <motion.div variants={fadeUp} className="text-center mb-[36px]">
              <SectionBadge color="#0A0A0A" text="Pricing" />
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A' }}>
                Simple, honest pricing
              </h2>
            </motion.div>

            <motion.p variants={fadeUp} className="text-center text-[14px] text-[#6B6B6B] mb-12">
              Monthly plans. Start free without a credit card.
            </motion.p>

            <motion.div variants={staggerContainer} className="grid lg:grid-cols-3 gap-6 items-stretch">
              {/* Free / Starter Card */}
              <motion.div
                variants={fadeUp}
                whileHover={{ y: -3 }}
                transition={springs.snappy}
                className="bg-white rounded-[20px] border border-[#EAEAEC] p-8 flex flex-col justify-between"
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
                    Great for trying out BuyerWatch buyer intent signals and rule monitoring.
                  </p>

                  <PremiumCtaButton href="/signup" fullWidth className="mb-6">
                    Get Started
                  </PremiumCtaButton>

                  <div className="w-full border-t border-dotted border-[#E2E2E6] mb-6" />

                  <div className="flex flex-col gap-3.5">
                    {[
                      '1 Active Keyword Rule',
                      'Up to 50 Buyer Intent Signals / mo',
                      'AI Intent Scoring (0–100)',
                      'Manual Review & Send Workflow',
                      'Reddit & Bluesky Monitoring'
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-left">
                        <svg className="w-[16px] h-[16px] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                          <path d="M13.3332 4L5.99984 11.3333L2.6665 8" stroke="#0A84FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
                className="bg-white rounded-[20px] border-2 border-[#0A0A0A] p-8 flex flex-col justify-between relative shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
              >
                {/* Recommended plan badge */}
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#0A0A0A] text-white text-[11px] font-bold px-3.5 py-1 rounded-full uppercase tracking-wider shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  Recommended
                </div>

                <div>
                  <h3 className="font-sans font-normal text-[20px] tracking-tight text-[#18181B] mb-4">
                    Professional
                  </h3>
                  <div className="flex items-baseline mb-4">
                    <span className="font-sans font-bold text-[44px] tracking-[-0.03em] leading-none text-[#18181B]">
                      $49
                    </span>
                    <span className="font-sans text-[14px] text-[#71717A] ml-1.5 font-normal">
                      /per month
                    </span>
                  </div>
                  <p className="font-sans text-[14px] text-[#52525B] font-normal mb-6 leading-relaxed min-h-[40px]">
                    Best for solo founders, freelancers & growing teams.
                  </p>

                  <PremiumCtaButton href="/signup" fullWidth className="mb-6">
                    Get Started
                  </PremiumCtaButton>

                  {/* Highlighted Headline Feature for Confidence Engine */}
                  <div className="mb-6 py-3.5 border-y border-[#EAEAEC] text-[13px] font-medium text-[#18181B] leading-snug text-left">
                    Guarded auto-send requires explicit opt-in and sufficient trust history.
                  </div>

                  <div className="w-full border-t border-dotted border-[#E2E2E6] mb-6" />

                  <div className="flex flex-col gap-3.5">
                    {[
                      'Everything in Free',
                      '10 Active Keyword Rules',
                      'Up to 1,000 Buyer Intent Signals / mo',
                      '400 AI Drafts / mo',
                      'Manual Review & Direct Posting',
                      'Guarded Auto-Send',
                      'Product Profile & Tone Examples'
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-left">
                        <svg className="w-[16px] h-[16px] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                          <path d="M13.3332 4L5.99984 11.3333L2.6665 8" stroke="#0A84FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
                className="bg-white rounded-[20px] border border-[#EAEAEC] p-8 flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-sans font-normal text-[20px] tracking-tight text-[#18181B] mb-4">
                    Growth
                  </h3>
                  <div className="flex items-baseline mb-4">
                    <span className="font-sans font-bold text-[44px] tracking-[-0.03em] leading-none text-[#18181B]">
                      $149
                    </span>
                    <span className="font-sans text-[14px] text-[#71717A] ml-1.5 font-normal">
                      /per month
                    </span>
                  </div>
                  <p className="font-sans text-[14px] text-[#52525B] font-normal mb-6 leading-relaxed min-h-[40px]">
                    Ideal for teams that need higher limits and the fastest included monitoring cadence.
                  </p>

                  <PremiumCtaButton href="/signup" fullWidth className="mb-6">
                    Get Started
                  </PremiumCtaButton>

                  <div className="w-full border-t border-dotted border-[#E2E2E6] mb-6" />

                  <div className="flex flex-col gap-3.5">
                    {[
                      'Everything in Professional',
                      '50 Active Keyword Rules',
                      'Up to 5,000 Buyer Intent Signals / mo',
                      '2,000 AI Drafts / mo',
                      '15-Minute Polling Cadence',
                      'Guarded Auto-Send',
                      'Reply Attribution & Trust Analytics'
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-left">
                        <svg className="w-[16px] h-[16px] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
                          <path d="M13.3332 4L5.99984 11.3333L2.6665 8" stroke="#0A84FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
                <Link href="/contact" className="text-[#0A0A0A] font-medium underline underline-offset-4 hover:text-[#27272A] transition-colors">
                  Contact us
                </Link>{' '}
                for custom volume requirements.
              </p>
            </motion.div>
          </div>
        </Section>

        <LandingFooter />

      </div>
    </div>
  )
}
