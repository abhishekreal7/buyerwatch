'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { SUPPORT_EMAIL } from '@/lib/public-config'

export default function PrivacyPage() {
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
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 mb-2" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
            Privacy Policy
          </h1>
          <p className="text-sm text-neutral-400 mb-10">Last updated: July 12, 2026</p>

          <div className="prose prose-neutral max-w-none text-neutral-600 space-y-6 text-[15px] leading-relaxed" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            <p>
              At Scouto, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              1. Information We Collect
            </h2>
            <p>
              When you use Scouto, we collect standard information necessary to provide and optimize the services:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Account Information:</strong> Your name, email address, password, and profile preferences when you register.</li>
              <li><strong>Connected Platforms:</strong> Authenticated account details (such as Reddit OAuth credentials or Bluesky handles) when you connect your accounts to enable drafting and posting. We store encrypted refresh tokens securely.</li>
              <li><strong>Configuration Data:</strong> Keywords, targeted subreddits, tone of voice guidelines, and business descriptions you save in your profile settings.</li>
            </ul>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              2. How We Use and Process Your Data
            </h2>
            <p>
              We process data solely to deliver social monitoring, scoring, and drafting capabilities:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Social Listening:</strong> We monitor public posts and comments matching your specified keywords.</li>
              <li><strong>AI Processing:</strong> Matching posts are analyzed by the AI providers configured for the service. We do not use your customer data, profiles, or private templates to train our own general-purpose public model.</li>
              <li><strong>Gated Posting Flow:</strong> Manual review is the default. Paid accounts may explicitly enable confidence-gated auto-send after completing the required trust-building reviews, and may disable it at any time.</li>
            </ul>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              3. Payment Processing
            </h2>
            <p>
              When paid plans are enabled, payments, billing details, and subscription management are processed by our merchant provider, <strong>Dodo Payments</strong>. Scouto does not collect or store full card numbers.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              4. Data Retention and Security
            </h2>
            <p>
              We retain your account details, keywords, and draft logs only as long as your account is active. You may disconnect connected platforms or request account deletion at any time. We protect credentials and tokens with AES-256 database encryption and industry-standard security practices.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              5. Contact Us
            </h2>
            <p>
              If you have any questions or concerns about our privacy practices, please contact us at <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex min-h-11 items-center align-middle text-[#0A84FF] hover:underline font-semibold">{SUPPORT_EMAIL}</a>.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
