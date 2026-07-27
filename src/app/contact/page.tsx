'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Mail, MessageSquare } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { SUPPORT_EMAIL } from '@/lib/public-config'

export default function ContactPage() {
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
      <main className="mx-auto max-w-xl px-4 pt-12 sm:px-6 sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
            Get in Touch
          </h1>
          <p className="text-neutral-500 mb-12 text-[15px]" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            Have questions about pricing, setup, features, or custom plans? We're here to help you get started.
          </p>

          <div className="space-y-5 sm:space-y-6">
            {/* Primary Action Card */}
            <div className="flex flex-col items-center rounded-2xl border border-neutral-100 bg-neutral-50 p-6 text-center sm:p-8">
              <div className="w-12 h-12 bg-[#0A84FF]/10 rounded-full flex items-center justify-center mb-4">
                <Mail className="w-6 h-6 text-[#0A84FF]" />
              </div>
              <h2 className="text-lg font-bold text-neutral-900 mb-2" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
                Email Support
              </h2>
              <p className="text-neutral-500 text-[14px] mb-6 max-w-xs" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                Send us a direct inquiry. We normally reply to all founder requests within a few hours.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Inquiry%20from%20BuyerWatch`}
                className="inline-flex items-center gap-2 bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-bold px-6 py-3 rounded-full transition-colors duration-150 shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
                style={{ fontFamily: 'var(--font-inter), sans-serif' }}
              >
                {SUPPORT_EMAIL}
              </a>
            </div>

            {/* Sub Action Card */}
            <div className="flex flex-col items-center rounded-2xl border border-neutral-100 bg-white p-6 text-center">
              <div className="w-10 h-10 bg-[#FF5101]/10 rounded-full flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5 text-[#FF5101]" />
              </div>
              <h3 className="font-bold text-neutral-900 mb-1" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
                Demo Requests
              </h3>
              <p className="text-neutral-500 text-[13px]" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                If you have large keyword groups or custom database setup requests, include details in your email.
              </p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
