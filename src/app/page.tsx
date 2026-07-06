'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRef, useState, useCallback } from 'react'
import { Check, Target, Search, LayoutDashboard, Eye, Shield, Gauge } from 'lucide-react'
import { springs, staggers } from '@/lib/motion'
import EyebrowBadge from '@/components/EyebrowBadge'

/* Stagger variant with 80ms cadence (spec-required for 4-step flow) */
const stagger80 = {
  container: {
    animate: { transition: { staggerChildren: 0.08 } },
  },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
  },
}

/* ── Drag-to-compare component ────────────────────────────────────────────── */
function DragCompare() {
  const [pct, setPct] = useState(50) // 0–100
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const update = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const { left, width } = containerRef.current.getBoundingClientRect()
    const raw = ((clientX - left) / width) * 100
    setPct(Math.min(85, Math.max(15, raw)))
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
      ; (e.target as HTMLElement).setPointerCapture(e.pointerId)
    update(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    update(e.clientX)
  }
  const onPointerUp = () => { dragging.current = false }

  return (
    <div
      ref={containerRef}
      className="relative rounded-[20px] border border-border shadow-elevation-4 overflow-hidden bg-white select-none"
      style={{ userSelect: 'none' }}
    >
      {/* Left panel — generic AI reply */}
      <div className="flex">
        <div className="flex-1 p-7 border-r border-border bg-white min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Generic AI</span>
          </div>
          <div className="text-sm text-text-secondary leading-relaxed space-y-3">
            <p>Hi there! I noticed you&apos;re looking for an email marketing tool.</p>
            <p>Have you tried <strong className="text-text-primary">ProductX</strong>? It&apos;s a great email marketing platform that offers many features at a competitive price. You can try it for free!</p>
            <p className="text-text-tertiary">Check it out at productx.com 🚀</p>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <span className="text-xs font-medium text-destructive bg-red-50 border border-red-100 px-2 py-1 rounded-md">❌ No disclosure</span>
            <span className="text-xs font-medium text-text-tertiary bg-surface border border-border px-2 py-1 rounded-md">Generic pitch</span>
          </div>
        </div>

        {/* Right panel — Scouto reply */}
        <div className="flex-1 p-7 bg-surface min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0A84FF]" />
            <span className="text-xs font-semibold text-[#0A84FF] uppercase tracking-wider">Scouto draft</span>
          </div>
          <div className="text-sm text-text-primary leading-relaxed space-y-3">
            <p>Klaviyo is great but I felt the same pain at scale. A few options worth considering depending on your volume:</p>
            <p><strong>Omnisend</strong> works well for Shopify and has a generous free tier. <strong>Loops</strong> is worth a look if you&apos;re doing any SaaS-style flows.</p>
            <p className="text-text-secondary">Full disclosure: I&apos;m building Scouto which does Reddit monitoring (different space entirely), so no dog in this fight — just options that came up when we had the same conversation internally.</p>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <span className="text-xs font-medium text-[#0A84FF] bg-[#0A84FF]/10 border border-[#0A84FF]/20 px-2 py-1 rounded-md">✓ Disclosed</span>
            <span className="text-xs font-medium text-text-secondary bg-white border border-border px-2 py-1 rounded-md">Genuine help</span>
          </div>
        </div>
      </div>

      {/* Clip overlay — hides the right panel proportionally */}
      <div
        className="absolute inset-0 bg-white pointer-events-none"
        style={{ left: `${pct}%` }}
      />

      {/* Drag handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-border cursor-col-resize flex items-center justify-center z-20"
        style={{ left: `calc(${pct}% - 0.5px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="separator"
        aria-label="Drag to compare"
      >
        <div className="w-8 h-8 rounded-full bg-white border border-border shadow-elevation-3 flex items-center justify-center pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M4 5l-2 2 2 2M10 5l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-tertiary" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-4 left-4 pointer-events-none z-10">
        <span className="text-xs font-semibold text-text-tertiary bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md border border-border">Generic AI</span>
      </div>
      <div className="absolute top-4 right-4 pointer-events-none z-10">
        <span className="text-xs font-semibold text-[#0A84FF] bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md border border-[#0A84FF]/20">Scouto</span>
      </div>
    </div>
  )
}


export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-text-primary selection:bg-[#0A84FF]/30">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md will-change-transform">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-xl tracking-tight">
            <Target className="w-6 h-6 text-[#0A84FF]" /> Scouto
          </div>
          <div className="flex items-center gap-6">
            <Link href="#features" className="hidden md:block text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">Features</Link>
            <Link href="#how-it-works" className="hidden md:block text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">How it works</Link>
            <Link href="#pricing" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">Pricing</Link>
            <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">Log in</Link>
            <Link href="/signup" className="text-sm font-medium bg-[#1D1D1F] text-white px-4 py-2 rounded-full hover:scale-105 transition-transform">Start Free</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section — DO NOT TOUCH */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 pt-32 pb-20 overflow-hidden">
        {/* Subtle noise background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none will-change-transform transform-gpu" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#0A84FF]/15 rounded-full blur-[80px] pointer-events-none"></div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.gentle}
          className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto"
        >
          <EyebrowBadge />

          <h1 className="font-display font-bold text-5xl md:text-7xl tracking-tight leading-[1.05] mb-6">
            Find your customers <br />on Reddit. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1D1D1F] to-[#86868B]">Before anyone else does.</span>
          </h1>

          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mb-10 leading-[1.6]">
            Scouto monitors Reddit and Bluesky 24/7, finds high-intent conversations, and organizes your community outreach in one dashboard.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 mb-8">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={springs.snappy}>
              <Link href="/signup" className="w-full sm:w-auto bg-[#0A84FF] text-text-primary px-8 py-4 rounded-xl font-medium shadow-[0_0_24px_rgba(10,132,255,0.4)] flex items-center justify-center gap-2">
                Start for free <span aria-hidden="true">→</span>
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={springs.snappy}>
              <Link href="#how-it-works" className="w-full sm:w-auto px-8 py-4 rounded-xl font-medium text-text-primary hover:bg-black/5 border border-transparent flex items-center justify-center">
                See how it works
              </Link>
            </motion.div>
          </div>

          <p className="text-sm text-text-tertiary font-medium">Free to start · No credit card · Setup in 2 minutes · Cancel anytime</p>
        </motion.div>

        {/* Floating Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.smooth}
          className="relative z-10 mt-20 w-full max-w-2xl transform-gpu"
        >
          <div className="bg-white rounded-[20px] p-7 shadow-elevation-4 border border-black/[0.06] relative">
            {/* Card header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#FF453A]"></span>
                <span className="text-sm font-semibold text-text-secondary">r/entrepreneur</span>
                <span className="text-text-tertiary text-sm">·</span>
                <span className="text-text-tertiary text-sm">2m ago</span>
              </div>
              <span className="text-xs font-semibold text-text-tertiary bg-surface px-2 py-1 rounded-md border border-border">Reddit</span>
            </div>

            {/* Post body */}
            <p className="text-[17px] text-text-primary mb-6 leading-relaxed font-medium">
              &quot;Anyone recommend a good email marketing tool for my Shopify store? Using Klaviyo but it&apos;s getting too expensive...&quot;
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between pt-5 border-t border-border">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 bg-surface text-text-primary border border-border px-3 py-1.5 rounded-full text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0A84FF]"></span>
                  Buying Intent · 94
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 bg-[#1a1613] text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                ✦ Ready to reply
              </span>
            </div>
          </div>

          {/* Floating Badges */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            style={{ willChange: 'transform' }}
            className="absolute -right-4 md:-right-10 top-6 bg-white border border-black/[0.06] shadow-elevation-3 px-4 py-2.5 rounded-[12px] text-sm font-medium text-text-primary hidden md:flex items-center gap-2 transform-gpu"
          >
            <span className="w-2 h-2 rounded-full bg-[#0A84FF]"></span>
            94% buying intent detected
          </motion.div>

          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
            style={{ willChange: 'transform' }}
            className="absolute -left-4 md:-left-8 top-28 bg-white border border-black/[0.06] shadow-elevation-3 px-4 py-2.5 rounded-[12px] text-sm font-medium text-text-primary hidden md:flex items-center gap-2 transform-gpu"
          >
            <span className="w-2 h-2 rounded-full bg-[#30D158]"></span>
            Alert sent instantly
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      {/* FIX: removed decorative blue ambient glow blob; removed glass/backdrop-blur from static inline cards;
           removed multi-color icon backgrounds (blue/green/orange → single neutral); normalized to bg-surface cards */}
      <section id="features" className="py-24 border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="font-display font-bold text-4xl mb-4 tracking-tight">Everything you need to grow organically</h2>
            <p className="text-xl text-text-secondary">Scouto provides the infrastructure you need to turn community discussions into paying customers.</p>
          </div>

          <motion.div
            variants={staggers.container}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <motion.div
              variants={staggers.item}
              whileHover={{ y: -2 }}
              transition={springs.smooth}
              className="bg-surface p-8 rounded-[20px] border border-border"
            >
              <div className="w-10 h-10 bg-surface-secondary rounded-xl flex items-center justify-center mb-6">
                <Search className="w-5 h-5 text-text-secondary" />
              </div>
              <h3 className="font-display font-bold text-xl mb-3">24/7 Keyword Monitoring</h3>
              <p className="text-text-secondary leading-relaxed">
                Track your brand name, competitors, or specific problems your product solves. We scan millions of posts daily so you don&apos;t have to.
              </p>
            </motion.div>

            <motion.div
              variants={staggers.item}
              whileHover={{ y: -2 }}
              transition={springs.smooth}
              className="bg-surface p-8 rounded-[20px] border border-border"
            >
              <div className="w-10 h-10 bg-surface-secondary rounded-xl flex items-center justify-center mb-6">
                <Target className="w-5 h-5 text-text-secondary" />
              </div>
              <h3 className="font-display font-bold text-xl mb-3">Buyer Intent Scoring</h3>
              <p className="text-text-secondary leading-relaxed">
                Not all posts are created equal. We analyze the context of every match and flag conversations where users are actively looking to buy.
              </p>
            </motion.div>

            <motion.div
              variants={staggers.item}
              whileHover={{ y: -2 }}
              transition={springs.smooth}
              className="bg-surface p-8 rounded-[20px] border border-border"
            >
              <div className="w-10 h-10 bg-surface-secondary rounded-xl flex items-center justify-center mb-6">
                <LayoutDashboard className="w-5 h-5 text-text-secondary" />
              </div>
              <h3 className="font-display font-bold text-xl mb-3">Engagement Dashboard</h3>
              <p className="text-text-secondary leading-relaxed">
                Keep track of which threads you&apos;ve replied to, review your drafts, and mark them as posted to maintain an organized workflow.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How it Works Section */}
      {/* FIX: removed bg-surface/30 (tinted surface) → plain bg-background section;
           removed decorative gradient blob (purple) behind mock card;
           removed glass + backdrop-blur-md on static inline post cards → plain bg-surface-secondary;
           removed bg-black/20 card backgrounds */}
      <section id="how-it-works" className="py-24 bg-surface border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="font-display font-bold text-3xl md:text-4xl mb-6 tracking-tight">Stop shouting into the void on X and LinkedIn.</h2>
              <p className="text-lg text-text-secondary mb-10 leading-relaxed">
                Traditional social media marketing is getting harder. Organic reach is dead, and ads are too expensive. Meanwhile, thousands of people are on Reddit asking for the exact solution you built.
              </p>

              <div className="space-y-8">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-surface-secondary border border-border flex items-center justify-center mt-1">
                    <span className="text-text-tertiary font-bold text-base">✕</span>
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-text-primary mb-2">The Old Way</h4>
                    <p className="text-text-secondary leading-relaxed">Wasting hours manually searching Reddit every day, missing out on opportunities because you logged off, and struggling to stay organized.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-surface-secondary border border-border flex items-center justify-center mt-1">
                    <Check className="w-5 h-5 text-text-primary" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-text-primary mb-2">The Scouto Way</h4>
                    <p className="text-text-secondary leading-relaxed">Set up your keywords once. We monitor the platforms 24/7 and deliver a curated feed of highly relevant conversations directly to your dashboard.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="bg-white rounded-[20px] p-6 shadow-elevation-4 relative z-10 border border-border"
              >
                <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400/70"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-400/70"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400/70"></div>
                  </div>
                  <div className="text-xs font-semibold text-[#0A84FF] bg-[#0A84FF]/10 px-3 py-1 rounded-md">Live Feed</div>
                </div>

                <div className="space-y-3">
                  <div className="bg-surface border border-border p-4 rounded-[12px]">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-xs font-semibold text-text-secondary bg-surface-secondary px-2 py-1 rounded-md">r/SaaS</span>
                      <span className="text-xs text-text-tertiary">2m ago</span>
                    </div>
                    <p className="text-sm text-text-primary font-medium leading-relaxed">&quot;Looking for a new email marketing platform, Mailchimp is too expensive now...&quot;</p>
                  </div>
                  <div className="bg-surface border border-border p-4 rounded-[12px] opacity-60">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-xs font-semibold text-text-secondary bg-surface-secondary px-2 py-1 rounded-md">r/entrepreneur</span>
                      <span className="text-xs text-text-tertiary">15m ago</span>
                    </div>
                    <p className="text-sm text-text-primary font-medium leading-relaxed">&quot;How do you guys handle customer support tickets efficiently across timezones?&quot;</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      {/* FIX: removed glass/backdrop-blur from static testimonial cards → bg-surface + border;
           removed bg-surface/30 section bg → plain bg-background */}
      <section className="py-24 border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 tracking-tight">Trusted by founders and marketers</h2>
          </div>
          <motion.div
            variants={staggers.container}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <motion.div variants={staggers.item} whileHover={{ y: -2 }} transition={springs.smooth} className="bg-surface p-6 rounded-[20px] border border-border">
              <p className="text-text-primary mb-4 leading-relaxed">&quot;Found 3 paying customers in the first week just from Reddit replies. The ROI is insane.&quot;</p>
              <div className="text-sm text-text-secondary font-medium">— SaaS Founder</div>
            </motion.div>
            <motion.div variants={staggers.item} whileHover={{ y: -2 }} transition={springs.smooth} className="bg-surface p-6 rounded-[20px] border border-border">
              <p className="text-text-primary mb-4 leading-relaxed">&quot;My Shopify store gets 200+ visits/week from Reddit now. All organic, highly qualified traffic.&quot;</p>
              <div className="text-sm text-text-secondary font-medium">— E-commerce Seller</div>
            </motion.div>
            <motion.div variants={staggers.item} whileHover={{ y: -2 }} transition={springs.smooth} className="bg-surface p-6 rounded-[20px] border border-border">
              <p className="text-text-primary mb-4 leading-relaxed">&quot;As a freelance designer, this replaced cold outreach entirely for me. People just come to me.&quot;</p>
              <div className="text-sm text-text-secondary font-medium">— Freelancer</div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── NEW § 1: 4-Step "How it works" flow ───────────────────────────── */}
      <section className="py-24 bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 tracking-tight">From keyword to customer in four steps</h2>
            <p className="text-lg text-text-secondary leading-relaxed">Set it up once. Scouto handles everything from discovery to draft.</p>
          </div>

          {/* 4-step grid with connecting line on desktop */}
          <div className="relative">
            {/* Connector line — desktop only, sits behind the cards */}
            <div className="hidden md:block absolute top-[38px] left-[calc(12.5%+20px)] right-[calc(12.5%+20px)] h-px bg-border z-0" aria-hidden="true" />

            <motion.div
              variants={stagger80.container}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true, margin: '-80px' }}
              className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10"
            >
              {[
                {
                  step: '01',
                  title: 'Monitor',
                  body: 'Scouto watches Reddit and Bluesky 24/7 for conversations matching your keywords.',
                },
                {
                  step: '02',
                  title: 'Score',
                  body: 'Every match gets an intent score, so you only see conversations worth your time.',
                },
                {
                  step: '03',
                  title: 'Draft',
                  body: 'AI writes a genuine, disclosed reply in your voice — never a sales pitch.',
                },
                {
                  step: '04',
                  title: 'Review & send',
                  body: 'Approve high-confidence drafts instantly, or review each one yourself.',
                },
              ].map(({ step, title, body }) => (
                <motion.div
                  key={step}
                  variants={stagger80.item}
                  whileHover={{ y: -2, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.06)' }}
                  transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                  className="bg-white rounded-[16px] p-6 border border-border shadow-elevation-1 flex flex-col"
                >
                  {/* Step number bubble — doubles as the connector anchor */}
                  <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center mb-5 self-start">
                    <span className="text-xs font-bold text-text-secondary tabular-nums">{step}</span>
                  </div>
                  <h3 className="font-display font-bold text-lg mb-2">{title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed">{body}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── NEW § 2: Drag-to-compare slider ──────────────────────────────── */}
      <section className="py-24 border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 tracking-tight">
              The difference is{' '}
              <span className="text-[#0A84FF]">night and day</span>
            </h2>
            <p className="text-lg text-text-secondary">Drag to compare a generic AI reply with what Scouto actually writes.</p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          >
            <DragCompare />
          </motion.div>
        </div>
      </section>

      {/* ── NEW § 3: Trust / Safeguards ──────────────────────────────────── */}
      <section className="py-24 bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 tracking-tight">Built with real safeguards</h2>
            <p className="text-lg text-text-secondary leading-relaxed">Not trust-badge filler — actual product behaviour that protects you and the platforms you use.</p>
          </div>

          <motion.div
            variants={staggers.container}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-80px' }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[
              {
                icon: <Eye className="w-5 h-5 text-text-secondary" />,
                title: 'Human review by default',
                body: 'Nothing posts without your approval, unless you explicitly enable high-confidence auto-send.',
              },
              {
                icon: <Shield className="w-5 h-5 text-text-secondary" />,
                title: 'Disclosure, always',
                body: 'Every reply that mentions your business discloses it. No hidden bots, no undisclosed pitches.',
              },
              {
                icon: <Gauge className="w-5 h-5 text-text-secondary" />,
                title: 'Rate-limited, on purpose',
                body: "Scouto paces replies to protect your account's reputation, never spamming a platform on your behalf.",
              },
            ].map(({ icon, title, body }) => (
              <motion.div
                key={title}
                variants={staggers.item}
                whileHover={{ y: -2, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.06)' }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                className="bg-white rounded-[16px] p-8 border border-border shadow-elevation-1"
              >
                <div className="w-10 h-10 bg-surface rounded-xl flex items-center justify-center mb-5">
                  {icon}
                </div>
                <h3 className="font-display font-bold text-lg mb-2">{title}</h3>
                <p className="text-text-secondary text-sm leading-relaxed">{body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── NEW § 4: Platform coverage ───────────────────────────────────── */}
      <section className="relative py-24 border-t border-border overflow-hidden">
        {/* Glow effect behind the section */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-[#0A84FF]/5 via-[#0085FF]/5 to-[#FF4500]/5 blur-[100px] pointer-events-none -z-10 rounded-full" />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 max-w-xl mx-auto">
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 tracking-tight">Works where your customers already are</h2>
            <p className="text-lg text-text-secondary">Active on the platforms that matter most — more coming.</p>
          </div>

          <motion.div
            variants={stagger80.container}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-60px' }}
            className="flex flex-wrap justify-center items-center gap-12 md:gap-16 max-w-4xl mx-auto mt-12"
          >
            {/* Reddit */}
            <motion.div
              variants={stagger80.item}
              className="flex flex-col items-center gap-3 cursor-default opacity-90 hover:opacity-100 hover:-translate-y-1 transition-all duration-300"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-[#FF4500]">
                <path d="M22 11.082c0-1.244-1.008-2.253-2.252-2.253-.615 0-1.173.252-1.574.655-1.58-.99-3.712-1.64-6.103-1.722l1.242-5.836 4.05 1.085c.036.784.685 1.412 1.478 1.412 1.157 0 1.433-.925 1.433-1.432s-.68-1.43-1.492-1.43c-.636 0-1.18.397-1.396.958L12.95 4.31a.342.342 0 0 0-.4.24l-1.363 6.4c-2.433.053-4.606.716-6.216 1.716-.402-.405-.96-.658-1.58-.658C2.15 12.008 1.14 13.017 1.14 14.26c0 .944.582 1.75 1.402 2.115-.027.215-.045.434-.045.656 0 3.708 4.265 6.72 9.5 6.72s9.5-3.012 9.5-6.72c0-.223-.018-.444-.046-.66.82-.36 1.402-1.168 1.402-2.115zm-14.74 3.737c0-.85.69-1.54 1.54-1.54.85 0 1.54.69 1.54 1.54s-.69 1.54-1.54 1.54c-.85 0-1.54-.69-1.54-1.54zm7.39 3.513c-1.39 1.39-3.86 1.48-4.93 1.48s-3.54-.09-4.93-1.48a.4.4 0 0 1 0-.568.4.4 0 0 1 .57 0c.98.98 2.76 1.25 4.36 1.25s3.38-.27 4.36-1.25a.4.4 0 0 1 .57 0 .4.4 0 0 1 0 .568zm-.85-1.973c-.85 0-1.54-.69-1.54-1.54s.69-1.54 1.54-1.54 1.54.69 1.54 1.54-.69 1.54-1.54 1.54z"/>
              </svg>
              <span className="text-[15px] font-medium text-text-primary tracking-tight">Reddit</span>
            </motion.div>

            {/* Bluesky */}
            <motion.div
              variants={stagger80.item}
              className="flex flex-col items-center gap-3 cursor-default opacity-90 hover:opacity-100 hover:-translate-y-1 transition-all duration-300"
            >
              <svg viewBox="0 0 320 286" fill="currentColor" className="w-8 h-8 text-[#0085FF]">
                <path d="M69.364 32.153C116.446 72.637 146.994 122.95 159.274 153.226C159.764 154.436 160.236 154.436 160.726 153.226C173.006 122.95 203.554 72.637 250.636 32.153C275.952 10.383 320 -15.548 320 28.529C320 46.104 309.289 110.158 300.99 135.253C287.481 176.106 244.595 186.291 210.643 178.681C260.852 184.979 301.121 211.597 296.887 251.341C291.681 300.199 227.135 281.334 160 216.711C92.865 281.334 28.319 300.199 23.113 251.341C18.879 211.597 59.148 184.979 109.357 178.681C75.405 186.291 32.519 176.106 19.01 135.253C10.711 110.158 0 46.104 0 28.529C0 -15.548 44.048 10.383 69.364 32.153Z"/>
              </svg>
              <span className="text-[15px] font-medium text-text-primary tracking-tight">Bluesky</span>
            </motion.div>

            {/* X */}
            <motion.div
              variants={stagger80.item}
              className="flex flex-col items-center gap-3 cursor-default opacity-90 hover:opacity-100 hover:-translate-y-1 transition-all duration-300"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-black">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span className="text-[15px] font-medium text-text-primary tracking-tight">X (Twitter)</span>
            </motion.div>

            {/* Threads */}
            <motion.div
              variants={stagger80.item}
              className="flex flex-col items-center gap-3 cursor-not-allowed opacity-40 grayscale"
            >
              <svg viewBox="0 0 192 192" fill="currentColor" className="w-8 h-8 text-text-tertiary">
                <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19477 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.805 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.008 151.936 172.061 128.646 165.923 114.072C160.71 101.696 153.255 93.6395 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z"/>
              </svg>
              <span className="text-[15px] font-medium text-text-tertiary tracking-tight">Threads</span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── NEW § 5: Product showcase ─────────────────────────────────────── */}
      <section className="py-24 bg-surface border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12 max-w-xl mx-auto">
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 tracking-tight">A dashboard built for speed</h2>
            <p className="text-lg text-text-secondary leading-relaxed">
              Triage, draft, and post — all from one focused view. No spreadsheets, no tab chaos.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="bg-white rounded-[20px] border border-border shadow-elevation-4 overflow-hidden"
          >
            {/* Window chrome bar */}
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-surface">
              <div className="w-3 h-3 rounded-full bg-red-400/60" />
              <div className="w-3 h-3 rounded-full bg-amber-400/60" />
              <div className="w-3 h-3 rounded-full bg-green-400/60" />
              <div className="flex-1" />
              <span className="text-xs text-text-tertiary font-medium">Scouto — Triage</span>
              <div className="flex-1" />
            </div>

            {/* Mock dashboard content */}
            <div className="p-6 space-y-3">
              {/* Header row */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-text-primary">Triage Queue</span>
                  <span className="inline-flex items-center gap-1 bg-[#0A84FF]/10 text-[#0A84FF] text-xs font-semibold px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0A84FF] animate-pulse inline-block" />
                    14 new
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary bg-surface px-3 py-1.5 rounded-lg border border-border">All platforms</span>
                  <span className="text-xs text-text-tertiary bg-surface px-3 py-1.5 rounded-lg border border-border">Score ≥ 70</span>
                </div>
              </div>

              {/* Thread rows */}
              {[
                { sub: 'r/SaaS', ago: '2m', score: 94, text: '"Looking for a new email marketing platform, Mailchimp is too expensive now..."', ready: true },
                { sub: 'r/entrepreneur', ago: '8m', score: 81, text: '"Anyone built a community around their SaaS? How did you get the first members?"', ready: true },
                { sub: 'Bluesky', ago: '14m', score: 76, text: '"Does anyone have a good tool for finding relevant Reddit threads automatically?"', ready: false },
              ].map(({ sub, ago, score, text, ready }, i) => (
                <div
                  key={i}
                  className={`rounded-[12px] border p-4 flex items-start gap-4 ${i === 0 ? 'bg-surface border-border' : 'bg-white border-border opacity-80'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-text-secondary bg-surface-secondary px-2 py-0.5 rounded">{sub}</span>
                      <span className="text-xs text-text-tertiary">{ago} ago</span>
                    </div>
                    <p className="text-sm text-text-primary font-medium leading-relaxed truncate">{text}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 mt-0.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0A84FF]" />
                      {score}
                    </span>
                    {ready ? (
                      <span className="bg-[#1a1613] text-white text-xs font-semibold px-3 py-1.5 rounded-full">Reply</span>
                    ) : (
                      <span className="bg-surface text-text-secondary border border-border text-xs font-medium px-3 py-1.5 rounded-full">Review</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Footer note */}
              <p className="text-xs text-text-tertiary text-center pt-3">
                Built by a solo founder who needed this for his own SaaS. Every feature exists because it solved a real problem.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      {/* FIX: removed decorative blue ambient glow blob; removed glass/glass-heavy from cards → bg-surface + border;
           removed blue as Pro CTA button fill → charcoal (#1a1613) primary;
           removed glow shadow on Pro button → shadow-elevation-1;
           removed blue fill on "Most Popular" badge → bg-surface-secondary + border;
           removed colored border on Pro card → standard border-border;
           removed blue check icons (accent reserved for status, not decorative list items) → text-text-primary;
           normalized all card radius to rounded-[20px] */}
      <section id="pricing" className="py-32 bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-display font-bold text-4xl mb-4 tracking-tight">Simple, transparent pricing</h2>
            <p className="text-xl text-text-secondary">Start for free, upgrade when you need more power.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Free */}
            <motion.div whileHover={{ y: -2 }} transition={springs.smooth} className="bg-white p-8 rounded-[20px] border border-border flex flex-col shadow-elevation-1">
              <h3 className="font-display font-bold text-2xl mb-2">Free</h3>
              <div className="text-4xl font-display font-bold mb-6 tabular-nums">$0<span className="text-xl text-text-secondary">/mo</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> 2 keywords</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> 10 threads/month</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> Basic intent scoring</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> Manual reply drafting</li>
              </ul>
              <Link href="/signup" className="w-full bg-surface hover:bg-surface-secondary text-text-primary py-3 rounded-xl font-medium transition-colors text-center border border-border">Start Free</Link>
            </motion.div>

            {/* Starter */}
            <motion.div whileHover={{ y: -2 }} transition={springs.smooth} className="bg-white p-8 rounded-[20px] border border-border flex flex-col shadow-elevation-1">
              <h3 className="font-display font-bold text-2xl mb-2">Starter</h3>
              <div className="text-4xl font-display font-bold mb-6 tabular-nums">$19<span className="text-xl text-text-secondary">/mo</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> 5 keywords</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> 100 threads/month</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> Intent analysis</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> Email digest</li>
              </ul>
              <Link href="/signup" className="w-full bg-surface hover:bg-surface-secondary text-text-primary py-3 rounded-xl font-medium transition-colors text-center border border-border">Start Free Trial</Link>
            </motion.div>

            {/* Pro — highlighted with charcoal primary button, not blue */}
            <motion.div whileHover={{ y: -2 }} transition={springs.smooth} className="bg-white p-8 rounded-[20px] border border-border relative flex flex-col shadow-elevation-2">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface-secondary text-text-primary border border-border text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">Most Popular</div>
              <h3 className="font-display font-bold text-2xl mb-2">Pro</h3>
              <div className="text-4xl font-display font-bold mb-6 tabular-nums">$49<span className="text-xl text-text-secondary">/mo</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> 20 keywords</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> Unlimited threads</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> Advanced filtering</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> Subreddit targeting</li>
              </ul>
              <Link href="/signup" className="w-full bg-[#1a1613] hover:bg-[#2b2621] text-white py-3 rounded-xl font-medium transition-colors text-center shadow-elevation-1">Start Free Trial</Link>
            </motion.div>

            {/* Agency */}
            <motion.div whileHover={{ y: -2 }} transition={springs.smooth} className="bg-white p-8 rounded-[20px] border border-border flex flex-col shadow-elevation-1">
              <h3 className="font-display font-bold text-2xl mb-2">Agency</h3>
              <div className="text-4xl font-display font-bold mb-6 tabular-nums">$149<span className="text-xl text-text-secondary">/mo</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> Unlimited everything</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> 5 client workspaces</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> White-label reports</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-4 h-4 text-text-primary flex-shrink-0" /> Priority support</li>
              </ul>
              <Link href="/signup" className="w-full bg-surface hover:bg-surface-secondary text-text-primary py-3 rounded-xl font-medium transition-colors text-center border border-border">Contact Sales</Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Final CTA Banner */}
      {/* FIX: removed bg-[#0A84FF]/5 blue tinted section bg → plain bg-surface (ash-gray, like other alternating sections);
           removed blue as CTA button fill → charcoal primary;
           removed heavy glow shadow → shadow-elevation-1;
           normalized button radius to rounded-xl (matches rest of page) */}
      <section className="py-24 border-t border-border">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-display font-bold text-4xl md:text-5xl mb-6 tracking-tight">Ready to find your next customer?</h2>
          <p className="text-xl text-text-secondary mb-10 max-w-2xl mx-auto">
            Join hundreds of founders who are already finding high-intent leads on Reddit and Bluesky automatically.
          </p>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={springs.snappy} className="inline-block">
            <Link href="/signup" className="bg-[#1a1613] hover:bg-[#2b2621] text-white px-10 py-4 rounded-xl font-bold text-lg shadow-elevation-1 flex items-center gap-2 transition-colors">
              Start your free trial <span aria-hidden="true">→</span>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 bg-background">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-xl mb-4 md:mb-0">
            <Target className="w-5 h-5 text-[#0A84FF]" /> Scouto
          </div>
          <div className="flex items-center gap-6 text-sm text-text-secondary mb-4 md:mb-0">
            <Link href="#" className="hover:text-text-primary transition-colors">Twitter</Link>
            <Link href="#" className="hover:text-text-primary transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-text-primary transition-colors">Terms</Link>
          </div>
          <div className="text-sm text-text-tertiary">
            © {new Date().getFullYear()} Scouto. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}







