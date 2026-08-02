'use client'

import { useState } from 'react'
import { forgotPasswordAction } from '@/app/actions/auth'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowLeft, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const res = await forgotPasswordAction(formData)
    if (res?.error) {
      setError(res.error)
      setLoading(false)
    } else if (res?.success) {
      setSuccess(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] flex flex-col justify-between items-center p-6 sm:p-10 relative selection:bg-black selection:text-white font-sans overflow-hidden">
      {/* Background Subtle Grid Effect */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(#000000 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Top Header Navigation */}
      <div className="w-full max-w-5xl flex items-center justify-between z-10">
        <Link 
          href="/login" 
          className="group inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5 text-[#888888] group-hover:text-[#0A0A0A]" />
          <span>Back to login</span>
        </Link>
      </div>

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 1, y: 8, scale: 1 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[400px] z-10 my-auto"
      >
        {/* Brand Lockup */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 mb-2 hover:opacity-80 transition-opacity focus:outline-none">
            <span className="text-3xl"><BrandLogo size="lg" /></span>
          </Link>
          <h2 className="text-[15px] font-medium text-[#666666] tracking-tight">
            Reset your password
          </h2>
        </div>

        {/* Card Shell */}
        <div className="bg-white rounded-2xl p-7 sm:p-8 border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden">
          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center text-center py-2"
              >
                <div className="w-12 h-12 bg-[#F0FDF4] border border-emerald-200/80 rounded-2xl flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6 text-[#10B981]" strokeWidth={2} />
                </div>
                <h3 className="text-[16px] font-semibold text-[#0A0A0A] mb-1.5 tracking-tight">
                  Check your email
                </h3>
                <p className="text-[13.5px] text-[#666666] leading-relaxed mb-6">
                  We&apos;ve sent a password reset link to your email address. It will expire in 1 hour.
                </p>
                <Link
                  href="/login"
                  className="w-full h-11 flex items-center justify-center bg-[#0A0A0A] text-white rounded-xl font-medium text-[13.5px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-[#1C1C1E] transition-all duration-200"
                >
                  Return to login
                </Link>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center gap-3 mb-6 p-3.5 bg-[#F7F7F8] border border-black/[0.06] rounded-xl">
                  <div className="w-9 h-9 bg-white border border-black/[0.08] rounded-lg flex items-center justify-center shrink-0 shadow-2xs">
                    <Mail className="w-4 h-4 text-[#0A84FF]" strokeWidth={2} />
                  </div>
                  <p className="text-[12.5px] text-[#555555] leading-snug">
                    Enter your email address and we&apos;ll send you a link to reset your password.
                  </p>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-5 p-3.5 bg-[#FFF5F5] border border-red-200/80 rounded-xl flex items-start gap-2.5 text-[13px] text-red-700 leading-snug"
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1">{error}</div>
                  </motion.div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-medium text-[#444444] mb-1.5 ml-0.5">
                      Email address
                    </label>
                    <input
                      id="forgot-email"
                      name="email"
                      type="email"
                      placeholder="name@company.com"
                      required
                      autoFocus
                      className="w-full h-11 bg-[#F7F7F8] border border-black/[0.08] rounded-xl px-3.5 text-[13.5px] text-[#0A0A0A] placeholder-[#888888] focus:bg-white focus:outline-none focus:border-black/30 focus:ring-2 focus:ring-black/[0.04] transition-all duration-200"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full h-11 flex items-center justify-center gap-2 bg-[#0A0A0A] text-white rounded-xl font-medium text-[13.5px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-[#1C1C1E] active:scale-[0.985] disabled:opacity-50 disabled:hover:bg-[#0A0A0A] transition-all duration-200 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white/70" />
                          <span>Sending link…</span>
                        </>
                      ) : (
                        <span>Send reset link</span>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Link */}
        <p className="text-center mt-6 text-[13px] text-[#666666]">
          Remember your password?{' '}
          <Link href="/login" className="inline-flex min-h-11 items-center px-1 font-medium text-[#0A0A0A] hover:underline underline-offset-4">
            Log in
          </Link>
        </p>
      </motion.div>

      {/* Bottom Footer */}
      <div className="w-full max-w-5xl flex items-center justify-center text-[12px] text-[#888888] z-10 pt-4">
        <span>© BuyerWatch, Inc. All rights reserved.</span>
      </div>
    </div>
  )
}
