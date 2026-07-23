'use client'

import { useState, useEffect } from 'react'
import { resetPasswordAction } from '@/app/actions/auth'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Target, Lock, Eye, EyeOff, AlertTriangle, ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [sessionReady, setSessionReady] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
      else if (sessionReady === null) {
        setTimeout(() => {
          if (sessionReady === null) setSessionReady(false)
        }, 2000)
      }
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const res = await resetPasswordAction(formData)
    if (res?.error) {
      setError(res.error)
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
          className="group inline-flex items-center gap-2 text-[13px] font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5 text-[#888888] group-hover:text-[#0A0A0A]" />
          <span>Back to login</span>
        </Link>
      </div>

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[400px] z-10 my-auto"
      >
        {/* Brand Lockup */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity focus:outline-none">
            <Target className="w-8 h-8 text-[#0A84FF]" strokeWidth={2.5} />
            <span className="text-3xl font-bold tracking-tight text-[#0A0A0A]">
              Scouto
            </span>
          </Link>
          <h2 className="text-[15px] font-medium text-[#666666] tracking-tight">
            Set a new password
          </h2>
        </div>

        {/* Card Shell */}
        <div className="bg-white rounded-2xl p-7 sm:p-8 border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden">
          {sessionReady === false ? (
            /* Expired State */
            <div className="flex flex-col items-center text-center py-2">
              <div className="w-12 h-12 bg-[#FFFBEB] border border-amber-200/80 rounded-2xl flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-[#F59E0B]" strokeWidth={2} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0A0A0A] mb-1.5 tracking-tight">
                Link expired or invalid
              </h3>
              <p className="text-[13.5px] text-[#666666] leading-relaxed mb-6">
                This password reset link has expired or has already been used. Please request a new one.
              </p>
              <Link
                href="/forgot-password"
                className="w-full h-11 flex items-center justify-center bg-[#0A0A0A] text-white rounded-xl font-medium text-[13.5px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-[#1C1C1E] transition-all duration-200"
              >
                Request new link
              </Link>
            </div>
          ) : (
            /* Password Form */
            <>
              <div className="flex items-center gap-3 mb-6 p-3.5 bg-[#F7F7F8] border border-black/[0.06] rounded-xl">
                <div className="w-9 h-9 bg-white border border-black/[0.08] rounded-lg flex items-center justify-center shrink-0 shadow-2xs">
                  <Lock className="w-4 h-4 text-[#0A84FF]" strokeWidth={2} />
                </div>
                <p className="text-[12.5px] text-[#555555] leading-snug">
                  Choose a strong password with at least 6 characters.
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
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="reset-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 6 characters"
                      required
                      minLength={6}
                      className="w-full h-11 bg-[#F7F7F8] border border-black/[0.08] rounded-xl px-3.5 pr-10 text-[13.5px] text-[#0A0A0A] placeholder-[#888888] focus:bg-white focus:outline-none focus:border-black/30 focus:ring-2 focus:ring-black/[0.04] transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#0A0A0A] transition-colors p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#444444] mb-1.5 ml-0.5">
                    Confirm new password
                  </label>
                  <div className="relative">
                    <input
                      id="reset-confirm-password"
                      name="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Confirm password"
                      required
                      minLength={6}
                      className="w-full h-11 bg-[#F7F7F8] border border-black/[0.08] rounded-xl px-3.5 pr-10 text-[13.5px] text-[#0A0A0A] placeholder-[#888888] focus:bg-white focus:outline-none focus:border-black/30 focus:ring-2 focus:ring-black/[0.04] transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#0A0A0A] transition-colors p-1"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || sessionReady === null}
                    className="w-full h-11 flex items-center justify-center gap-2 bg-[#0A0A0A] text-white rounded-xl font-medium text-[13.5px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-[#1C1C1E] active:scale-[0.985] disabled:opacity-50 disabled:hover:bg-[#0A0A0A] transition-all duration-200 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white/70" />
                        <span>Updating password…</span>
                      </>
                    ) : sessionReady === null ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white/70" />
                        <span>Verifying link…</span>
                      </>
                    ) : (
                      <span>Update password</span>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Footer Link */}
        <p className="text-center mt-6 text-[13px] text-[#666666]">
          Remember your password?{' '}
          <Link href="/login" className="font-medium text-[#0A0A0A] hover:underline underline-offset-4">
            Log in
          </Link>
        </p>
      </motion.div>

      {/* Bottom Footer */}
      <div className="w-full max-w-5xl flex items-center justify-center text-[12px] text-[#888888] z-10 pt-4">
        <span>© Scouto, Inc. All rights reserved.</span>
      </div>
    </div>
  )
}

