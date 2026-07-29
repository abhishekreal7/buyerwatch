'use client'

import { useState } from 'react'
import { signUpAction } from '@/app/actions/auth'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    const formData = new FormData(e.currentTarget)
    const res = await signUpAction(formData)
    if (res?.error) {
      setError(res.error)
    } else if (res?.success) {
      setMessage(res.success)
    }
    setLoading(false)
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
          href="/" 
          className="group inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5 text-[#888888] group-hover:text-[#0A0A0A]" />
          <span>Back to home</span>
        </Link>
      </div>

      {/* Main Authentication Card */}
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
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
            Create your account to start monitoring
          </h2>
        </div>

        {/* Card Shell */}
        <div className="bg-white rounded-2xl p-7 sm:p-8 border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden">
          
          {/* Messages */}
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

          {message && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-5 p-3.5 bg-[#F0FDF4] border border-emerald-200/80 rounded-xl flex items-start gap-2.5 text-[13px] text-emerald-800 leading-snug"
            >
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="flex-1">{message}</div>
            </motion.div>
          )}

          {/* Social Authentication */}
          <div className="mb-5">
            <a
              href="/api/auth/google?next=signup"
              className="w-full h-11 flex items-center justify-center gap-2.5 bg-white border border-black/[0.12] hover:border-black/25 text-[#0A0A0A] rounded-xl font-medium text-[13.5px] transition-all duration-200 hover:bg-[#F9F9F9] active:scale-[0.985] shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>Sign up with Google</span>
            </a>
          </div>

          {/* Elegant Divider */}
          <div className="relative flex items-center justify-center my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-black/[0.07]" />
            </div>
            <div className="relative bg-white px-3 text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
              or sign up with email
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-[#444444] mb-1.5 ml-0.5">
                Email address
              </label>
              <input
                name="email"
                type="email"
                placeholder="name@company.com"
                required
                className="w-full h-11 bg-[#F7F7F8] border border-black/[0.08] rounded-xl px-3.5 text-[13.5px] text-[#0A0A0A] placeholder-[#888888] focus:bg-white focus:outline-none focus:border-black/30 focus:ring-2 focus:ring-black/[0.04] transition-all duration-200"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#444444] mb-1.5 ml-0.5">
                Password
              </label>
              <input
                name="password"
                type="password"
                placeholder="Min 6 characters"
                required
                minLength={6}
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
                    <span>Creating account…</span>
                  </>
                ) : (
                  <span>Create account</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer Link */}
        <p className="text-center mt-6 text-[13px] text-[#666666]">
          Already have an account?{' '}
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

