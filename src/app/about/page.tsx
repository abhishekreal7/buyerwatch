'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Heart, Sparkles, ShieldCheck } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 pb-20">
      {/* Header */}
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-neutral-100 px-4 py-5 sm:px-8 sm:py-6">
        <Link href="/" className="flex min-h-11 items-center gap-2 font-bold text-lg tracking-tight text-neutral-900">
          <BrandLogo size="sm" />
        </Link>
        <Link href="/" className="flex min-h-11 items-center gap-1 px-1 text-sm text-neutral-500 hover:text-neutral-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-3xl px-4 pt-12 sm:px-6 sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 mb-6" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
            About BuyerWatch
          </h1>

          <div className="prose prose-neutral max-w-none text-neutral-600 space-y-6 text-[15.5px] leading-relaxed" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            <p>
              BuyerWatch was built to solve a problem faced by almost every early-stage founder and marketer: finding the exact moments when people are looking for a product like yours, and engaging with them before the conversation moves on.
            </p>

            <p>
              Traditionally, social monitoring meant spending hours scrolling through subreddits, filtering through hundreds of irrelevant posts, and struggling to draft authentic responses that don't sound like spam. We knew there had to be a better way.
            </p>

            <p>
              BuyerWatch automates this monitoring process by searching communities 24/7. When a match is found, our dual-stage AI pipeline handles the heavy lifting: first, a buyer-intent analysis (powered by Gemini) determines how warm the lead is; second, a voice-matching agent (powered by Claude) drafts a natural response tailored to your company's profile and custom tone.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-12 mb-6" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              Our Core Principles
            </h2>

            <div className="grid gap-6 mt-4">
              <div className="flex gap-4 items-start p-5 bg-neutral-50 rounded-[20px] border border-neutral-100">
                <Heart className="w-5 h-5 text-[#FF5101] shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-1">Authentic Human Connection</h3>
                  <p className="text-[14px] text-neutral-500">
                    Manual review is the default. Guarded auto-send is optional on eligible paid plans and unlocks only after trust-building reviews, with confidence and content safeguards applied to every reply.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 items-start p-5 bg-neutral-50 rounded-[20px] border border-neutral-100">
                <Sparkles className="w-5 h-5 text-[#0A84FF] shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-1">High Accuracy, No Noise</h3>
                  <p className="text-[14px] text-neutral-500">
                    We tune our intent scores so you only see high-intent opportunities. Our goal is to save you hours every day, showing only conversations that matter.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 items-start p-5 bg-neutral-50 rounded-[20px] border border-neutral-100">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-1">Privacy & Brand Safety</h3>
                  <p className="text-[14px] text-neutral-500">
                    Your credentials, connection tokens, and settings are encrypted. We build for long-term customer relationships and adhere strictly to platforms' terms.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
