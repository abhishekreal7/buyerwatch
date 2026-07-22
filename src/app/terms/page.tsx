'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Target, ArrowLeft } from 'lucide-react'

export default function TermsPage() {
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
      <main className="max-w-3xl mx-auto px-6 pt-16">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 mb-2" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
            Terms of Service
          </h1>
          <p className="text-sm text-neutral-400 mb-10">Last updated: July 12, 2026</p>

          <div className="prose prose-neutral max-w-none text-neutral-600 space-y-6 text-[15px] leading-relaxed" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            <p>
              Welcome to Scouto. By accessing or using our website and services, you agree to comply with and be bound by these Terms of Service.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              1. Acceptable Use and Platform Policies
            </h2>
            <p>
              Scouto is designed to assist you in monitoring public social networks (such as Reddit or Bluesky) and drafting replies. When using Scouto, you agree:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>To comply with the target platform's policies, terms, and API guidelines.</li>
              <li>Not to use the service to conduct automated spam, target individuals with malicious content, or post low-quality boilerplate text.</li>
              <li>That you are entirely responsible for reviewing, checking the tone of, and manually approving all posts made from your authenticated accounts.</li>
            </ul>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              2. Accounts and Security
            </h2>
            <p>
              You must provide accurate and complete registration information. You are responsible for safeguarding your account access credentials and OAuth tokens. Scouto cannot and will not be liable for any loss or damage arising from your failure to maintain account security.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              3. Payments, Subscriptions, and Refunds
            </h2>
            <p>
              All purchases and plan subscriptions (including billing, payments, and invoices) are handled exclusively via <strong>Lemon Squeezy</strong>. Subscriptions are billed in advance on a recurring monthly or annual basis. You may cancel your subscription at any time through your Lemon Squeezy dashboard or profile links. Refunds are handled in accordance with Lemon Squeezy's billing policies.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              4. Disclaimer of Warranties
            </h2>
            <p>
              Scouto is provided on an "AS IS" and "AS AVAILABLE" basis. We do not warrant that the service will be error-free, uninterrupted, or that AI-generated content will always be accurate. You use the service at your own risk.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              5. Limitation of Liability
            </h2>
            <p>
              In no event shall Scouto, its developers, or its affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or platform account access resulting from your use of the service.
            </p>

            <h2 className="text-xl font-bold text-neutral-900 mt-8 mb-4" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
              6. Contact Us
            </h2>
            <p>
              If you have any questions or require support regarding these Terms of Service, please contact us at <a href="mailto:support@scouto.com" className="text-[#0A84FF] hover:underline font-semibold">support@scouto.com</a>.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
