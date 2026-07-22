'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Check, Target, Edit3, MessageCircle } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-text-primary selection:bg-[#0A84FF]/30">
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-xl tracking-tight">
            <Target className="w-6 h-6 text-[#0A84FF]" /> Scouto
          </div>
          <div className="flex items-center gap-6">
            <Link href="#how-it-works" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">How it works</Link>
            <Link href="#pricing" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">Pricing</Link>
            <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">Log in</Link>
            <Link href="/signup" className="text-sm font-medium bg-white text-black px-4 py-2 rounded-full hover:scale-105 transition-transform">Start Free</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 pt-32 pb-20 overflow-hidden">
        {/* Subtle noise background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
        
        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#0A84FF]/20 rounded-full blur-[120px] pointer-events-none"></div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, type: "spring", bounce: 0 }}
          className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto"
        >
          <div className="glass px-4 py-1.5 rounded-full flex items-center gap-2 mb-8 border-border shadow-apple">
            <span className="w-2 h-2 rounded-full bg-[#0A84FF] animate-pulse"></span>
            <span className="text-sm font-medium text-[#0A84FF]">Γ£ª Reddit is now your growth channel</span>
          </div>

          <h1 className="font-display font-bold text-5xl md:text-7xl tracking-[-0.03em] leading-[1.05] mb-6">
            Find your customers <br/>on Reddit. <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[#98989D]">Before anyone else does.</span>
          </h1>

          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mb-10 leading-[1.6]">
            Scouto monitors Reddit 24/7, finds conversations where people need what you sell, and drafts replies that sound human ΓÇö not AI.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 mb-8">
            <Link href="/signup" className="w-full sm:w-auto bg-[#0A84FF] text-text-primary px-8 py-4 rounded-xl font-medium shadow-[0_0_24px_rgba(10,132,255,0.4)] hover:shadow-[0_0_32px_rgba(10,132,255,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              Start for free <span aria-hidden="true">ΓåÆ</span>
            </Link>
            <Link href="#how-it-works" className="w-full sm:w-auto px-8 py-4 rounded-xl font-medium text-text-primary hover:bg-black/5 border border-transparent transition-colors flex items-center justify-center">
              See how it works
            </Link>
          </div>

          <p className="text-sm text-text-tertiary font-medium">Free to start ┬╖ No credit card ┬╖ Setup in 2 minutes ┬╖ Cancel anytime</p>
        </motion.div>

        {/* Floating Mockup */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, type: "spring" }}
          className="relative z-10 mt-20 w-full max-w-2xl"
        >
          <div className="glass rounded-2xl p-6 shadow-apple border-border relative">
            <div className="flex items-center gap-3 mb-4 text-text-secondary text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-[#FF453A]"></span>
              r/entrepreneur <span className="mx-1">┬╖</span> 2m ago
            </div>
            <p className="text-lg text-text-primary mb-6 leading-relaxed font-medium">
              "Anyone recommend a good email marketing tool for my Shopify store? Using Klaviyo but it's getting too expensive..."
            </p>
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-3">
                <span className="bg-[#30D158]/20 text-[#30D158] border border-[#30D158]/30 px-3 py-1 rounded-full text-sm font-semibold">≡ƒƒó Buying Intent</span>
                <span className="text-text-secondary text-sm">Score: 94/100</span>
              </div>
              <div className="flex items-center gap-2 text-[#0A84FF] text-sm font-semibold">
                Γ£ª Draft ready
              </div>
            </div>
          </div>

          {/* Floating Badges */}
          <motion.div 
            animate={{ y: [0, -10, 0] }} 
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="absolute -right-12 top-8 glass px-4 py-2 rounded-xl text-sm font-medium text-text-primary shadow-apple border-border hidden md:flex items-center gap-2"
          >
            ≡ƒÄ» 94% buying intent detected
          </motion.div>

          <motion.div 
            animate={{ y: [0, 10, 0] }} 
            transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
            className="absolute -left-8 top-32 glass px-4 py-2 rounded-xl text-sm font-medium text-text-primary shadow-apple border-border hidden md:flex items-center gap-2"
          >
            Γ£ì∩╕Å Reply drafted in your voice
          </motion.div>
        </motion.div>
      </section>

      {/* Social Proof */}
      <section className="py-20 border-t border-border bg-surface/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass p-6 rounded-2xl border-border">
              <p className="text-text-primary mb-4 leading-relaxed">"Found 3 paying customers in the first week just from Reddit replies. The ROI is insane."</p>
              <div className="text-sm text-text-secondary font-medium">ΓÇö SaaS Founder</div>
            </div>
            <div className="glass p-6 rounded-2xl border-border">
              <p className="text-text-primary mb-4 leading-relaxed">"My Shopify store gets 200+ visits/week from Reddit now. All organic, highly qualified traffic."</p>
              <div className="text-sm text-text-secondary font-medium">ΓÇö E-commerce Seller</div>
            </div>
            <div className="glass p-6 rounded-2xl border-border">
              <p className="text-text-primary mb-4 leading-relaxed">"As a freelance designer, this replaced cold outreach entirely for me. People just come to me."</p>
              <div className="text-sm text-text-secondary font-medium">ΓÇö Freelancer</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-display font-bold text-4xl mb-4">Simple, transparent pricing</h2>
            <p className="text-xl text-text-secondary">Start for free, upgrade when you need more power.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Free */}
            <div className="glass p-8 rounded-[24px] border-border flex flex-col">
              <h3 className="font-display font-bold text-2xl mb-2">Free</h3>
              <div className="text-4xl font-display font-bold mb-6">$0<span className="text-xl text-text-secondary">/mo</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> 2 keywords</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> 10 threads/month</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> Basic intent scoring</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> Manual reply drafting</li>
              </ul>
              <Link href="/signup" className="w-full bg-black/5 hover:bg-black/10 text-text-primary py-3 rounded-xl font-medium transition-colors text-center">Start Free</Link>
            </div>

            {/* Starter */}
            <div className="glass p-8 rounded-[24px] border-border flex flex-col">
              <h3 className="font-display font-bold text-2xl mb-2">Starter</h3>
              <div className="text-4xl font-display font-bold mb-6">$19<span className="text-xl text-text-secondary">/mo</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> 5 keywords</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> 100 threads/month</li>
                <li className="flex items-center gap-3 text-sm text-text-primary"><Check className="w-5 h-5 text-[#0A84FF]" /> 50 AI drafts/month</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> Email digest</li>
              </ul>
              <Link href="/signup" className="w-full bg-black/5 hover:bg-black/10 text-text-primary py-3 rounded-xl font-medium transition-colors text-center">Start Free Trial</Link>
            </div>

            {/* Pro */}
            <div className="glass p-8 rounded-[24px] border-[#0A84FF]/50 relative flex flex-col shadow-[0_0_40px_rgba(10,132,255,0.15)] transform scale-105 z-10">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0A84FF] text-text-primary text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">Most Popular</div>
              <h3 className="font-display font-bold text-2xl mb-2">Pro</h3>
              <div className="text-4xl font-display font-bold mb-6">$49<span className="text-xl text-text-secondary">/mo</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> 20 keywords</li>
                <li className="flex items-center gap-3 text-sm text-text-primary"><Check className="w-5 h-5 text-[#0A84FF]" /> Unlimited threads</li>
                <li className="flex items-center gap-3 text-sm text-text-primary"><Check className="w-5 h-5 text-[#0A84FF]" /> Unlimited AI drafts</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> Subreddit targeting</li>
              </ul>
              <Link href="/signup" className="w-full bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-text-primary py-3 rounded-xl font-medium transition-colors text-center shadow-[0_0_20px_rgba(10,132,255,0.3)]">Start Free Trial</Link>
            </div>

            {/* Agency */}
            <div className="glass p-8 rounded-[24px] border-border flex flex-col">
              <h3 className="font-display font-bold text-2xl mb-2">Agency</h3>
              <div className="text-4xl font-display font-bold mb-6">$149<span className="text-xl text-text-secondary">/mo</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-text-primary"><Check className="w-5 h-5 text-[#0A84FF]" /> Unlimited everything</li>
                <li className="flex items-center gap-3 text-sm text-text-primary"><Check className="w-5 h-5 text-[#0A84FF]" /> 5 client workspaces</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> White-label reports</li>
                <li className="flex items-center gap-3 text-sm text-text-secondary"><Check className="w-5 h-5 text-text-primary" /> Priority support</li>
              </ul>
              <Link href="/signup" className="w-full bg-black/5 hover:bg-black/10 text-text-primary py-3 rounded-xl font-medium transition-colors text-center">Contact Sales</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-xl mb-4 md:mb-0">
            <Target className="w-5 h-5 text-[#0A84FF]" /> Scouto
          </div>
          <div className="text-sm text-text-tertiary">
            ┬⌐ {new Date().getFullYear()} Scouto. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
