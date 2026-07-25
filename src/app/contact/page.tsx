'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Target, ArrowLeft, Mail, MessageSquare } from 'lucide-react'

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@example.com'

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 pb-20">
      {/* Header */}
      <header className="border-b border-neutral-100 py-6 px-8 flex items-center justify-between max-w-5xl mx-auto">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight text-neutral-900">
          <Target className="w-5 h-5 text-[#0A84FF]" strokeWidth={2.2} />
          Scouto
        </Link>
        <Link href="/" className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </header>

      {/* Main Content */}
      <main className="max-w-xl mx-auto px-6 pt-16">
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

          <div className="space-y-6">
            {/* Primary Action Card */}
            <div className="bg-neutral-50 border border-neutral-100 rounded-[24px] p-8 text-center flex flex-col items-center">
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
                href={`mailto:${supportEmail}?subject=Inquiry%20from%20Scouto`}
                className="inline-flex items-center gap-2 bg-[#0A0A0A] hover:bg-[#222] text-white text-[14px] font-bold px-6 py-3 rounded-full transition-colors duration-150 shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
                style={{ fontFamily: 'var(--font-inter), sans-serif' }}
              >
                {supportEmail}
              </a>
            </div>

            {/* Sub Action Card */}
            <div className="bg-white border border-neutral-100 rounded-[24px] p-6 text-center flex flex-col items-center">
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
