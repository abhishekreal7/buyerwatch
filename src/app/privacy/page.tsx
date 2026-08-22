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
          <p className="text-sm text-neutral-400 mb-10">Last updated: August 8, 2026</p>

          <div className="prose prose-neutral max-w-none text-neutral-600 space-y-6 text-[15px] leading-relaxed" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            <p>
              At BuyerWatch, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              1. Information We Collect
            </h2>
            <p>
              When you use BuyerWatch, we collect standard information necessary to provide and optimize the services:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Account Information:</strong> Your name, email address, and profile preferences when you register. Password authentication is handled by our authentication provider; BuyerWatch does not store plaintext passwords.</li>
              <li><strong>Connected Platforms:</strong> Account identifiers and encrypted platform sessions when you connect Reddit or Bluesky to enable delivery. BuyerWatch does not persist your Reddit password or two-factor authentication secret.</li>
              <li><strong>Configuration Data:</strong> Keywords, targeted subreddits, tone of voice guidelines, and business descriptions you save in your profile settings.</li>
              <li><strong>Public Conversation Data:</strong> Public post URLs, titles, bodies, authors, communities, and publication times that match your monitoring rules.</li>
            </ul>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              2. Reddit Account Connection
            </h2>
            <p>
              Reddit connections can use the BuyerWatch Chrome connector, an organization&apos;s Sprinklr integration, or the legacy RedditAPIs connection path. The Chrome connector verifies the username already signed in to Reddit without reading or transmitting the Reddit password or cookies. With Sprinklr, Reddit authorization is managed in Sprinklr and BuyerWatch stores only an encrypted account mapping. With RedditAPIs, your Reddit username, password, and optional two-factor setup secret are sent once through BuyerWatch&apos;s encrypted HTTPS endpoint to establish a session; BuyerWatch encrypts the returned session cookies at rest and does not save the submitted password or two-factor secret. RedditAPIs is an independent third party and is not affiliated with Reddit.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Connection credentials are held only in request memory for the login attempt and are not written to BuyerWatch&apos;s database or application logs.</li>
              <li>Encrypted session cookies are accessible only to BuyerWatch&apos;s server-side delivery process.</li>
              <li>If Reddit expires the session, automatic Reddit delivery is paused until you reconnect.</li>
              <li>You can disconnect Reddit at any time to delete the stored session.</li>
            </ul>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              3. How We Use and Process Your Data
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
              4. Payment Processing
            </h2>
            <p>
              When paid plans are enabled, payments, billing details, and subscription management are processed by our merchant provider, <strong>Dodo Payments</strong>. BuyerWatch does not collect or store full card numbers.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              5. Data Retention and Security
            </h2>
            <p>
              We retain your account details, keywords, monitored conversations, draft logs, and encrypted platform sessions only while needed to provide the service or meet legal obligations. You may disconnect connected platforms or request account deletion at any time. We protect server-side session material with authenticated AES-256 encryption and restrict it to server-only database access.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              6. Contact Us
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
