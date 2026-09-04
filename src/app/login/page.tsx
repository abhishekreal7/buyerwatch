'use client'

import { useState, Suspense, useEffect, useRef } from 'react'
import { signInWithEmailAction, verifyEmailOtpAction } from '@/app/actions/auth'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, AlertCircle, ArrowRight, CheckCircle2, MailCheck, Mail, Info, ShieldCheck } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { useSearchParams } from 'next/navigation'
import { friendlyAuthError } from '@/lib/auth-errors'
import {
  normalizeSelectedBillingCadence,
  normalizeSelectedBillingPlan,
} from '@/lib/billing-selection'

function LoginContent() {
  const searchParams = useSearchParams()
  const rawUrlError = searchParams.get('error')
  const initialStep = searchParams.get('step') === 'otp' ? 'otp' : 'email'
  const initialEmail = searchParams.get('email') || ''
  const selectedPlan = normalizeSelectedBillingPlan(searchParams.get('plan'))
  const selectedBilling = normalizeSelectedBillingCadence(searchParams.get('billing'))

  const OTP_LENGTH = 6
  const [step, setStep] = useState<'email' | 'otp'>(initialStep)
  const [email, setEmail] = useState(initialEmail)
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [otpFocused, setOtpFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(60)
  const [resendLoading, setResendLoading] = useState(false)

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const isSubmittingRef = useRef(false)

  const urlError = rawUrlError ? friendlyAuthError(rawUrlError) : null

  useEffect(() => {
    if (rawUrlError) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [rawUrlError])

  // Countdown timer for OTP resend
  useEffect(() => {
    if (step !== 'otp' || resendCountdown <= 0) return
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [step, resendCountdown])

  // Auto-focus first empty OTP field when entering OTP step
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => {
        otpInputRefs.current[0]?.focus()
      }, 100)
    }
  }, [step])

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMessage(null)

    const formData = new FormData(e.currentTarget)
    const res = await signInWithEmailAction(formData)
    if (res?.error) {
      setError(res.error)
      setLoading(false)
    } else {
      setStep('otp')
      setResendCountdown(60)
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e?: React.FormEvent<HTMLFormElement>, overrideCode?: string) => {
    if (e) e.preventDefault()
    if (isSubmittingRef.current) return

    const code = (overrideCode || otp.join('')).trim()
    if (code.length < OTP_LENGTH) {
      setError(`Please enter all ${OTP_LENGTH} digits of the verification code.`)
      return
    }

    isSubmittingRef.current = true
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('email', email)
    formData.append('code', code)
    if (selectedPlan) formData.append('plan', selectedPlan)
    if (selectedBilling) formData.append('billing', selectedBilling)

    try {
      const res = await verifyEmailOtpAction(formData)
      if (res?.error) {
        setError(res.error)
        setLoading(false)
        isSubmittingRef.current = false
      }
    } catch {
      setLoading(false)
      isSubmittingRef.current = false
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    // Only accept numeric characters
    const digits = value.replace(/\D/g, '')
    if (!digits) {
      const newOtp = [...otp]
      newOtp[index] = ''
      setOtp(newOtp)
      return
    }

    const char = digits.slice(-1)
    const newOtp = [...otp]
    newOtp[index] = char
    setOtp(newOtp)

    if (index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus()
    } else if (newOtp.every((d) => d !== '')) {
      // Auto submit with fresh complete code directly to avoid closure lag
      handleVerifyOtp(undefined, newOtp.join(''))
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otp[index] === '' && index > 0) {
        otpInputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ''
        setOtp(newOtp)
      } else {
        const newOtp = [...otp]
        newOtp[index] = ''
        setOtp(newOtp)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return

    const newOtp = [...otp]
    for (let i = 0; i < OTP_LENGTH; i++) {
      newOtp[i] = pasted[i] || ''
    }
    setOtp(newOtp)

    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
    otpInputRefs.current[focusIdx]?.focus()

    if (pasted.length === OTP_LENGTH) {
      handleVerifyOtp(undefined, pasted)
    }
  }

  const handleResend = async () => {
    if (resendCountdown > 0 || resendLoading) return
    setResendLoading(true)
    setError(null)
    setOtp(Array(OTP_LENGTH).fill(''))
    isSubmittingRef.current = false

    const formData = new FormData()
    formData.append('email', email)
    if (selectedPlan) formData.append('plan', selectedPlan)
    if (selectedBilling) formData.append('billing', selectedBilling)

    const res = await signInWithEmailAction(formData)
    setResendLoading(false)
    if (res?.error) {
      setError(res.error)
    } else {
      setResendCountdown(60)
      setSuccessMessage('A fresh 6-digit code has been sent.')
      setTimeout(() => setSuccessMessage(null), 4000)
    }
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-center items-center p-4 sm:p-6 relative selection:bg-neutral-900 selection:text-white font-sans"
      style={{
        background: 'radial-gradient(circle at 50% 0%, #f4f3ef 0%, #ffffff 55%)',
      }}
    >
      {/* Subtle ambient brand glow behind card */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full pointer-events-none opacity-40 blur-[80px]"
        style={{
          background: 'radial-gradient(circle, rgba(20, 126, 255, 0.08) 0%, rgba(158, 252, 101, 0.06) 50%, transparent 70%)',
        }}
      />

      {/* Main Authentication Card */}
      <div className="w-full max-w-[396px] z-10 my-auto">
        <div className="bg-white rounded-3xl p-7 sm:p-9 border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_40px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] relative">

          {/* Dynamic Error Callout */}
          {(urlError || error) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-3.5 bg-red-50/80 border border-red-200/90 rounded-2xl flex items-start gap-2.5 text-[12.5px] text-red-700 leading-snug"
            >
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">{error || urlError}</div>
            </motion.div>
          )}

          {/* Dynamic Success Callout */}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-[12.5px] text-emerald-800 leading-snug"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-emerald-950">Code resent</p>
                <p className="mt-0.5 text-emerald-700">{successMessage}</p>
              </div>
            </motion.div>
          )}

          {step === 'email' ? (
            /* STEP 1: INITIAL SIGN IN CARD */
            <div>
              {/* Brand Header */}
              <div className="flex items-center justify-center mb-6">
                <Link href="/" className="inline-flex items-center justify-center hover:opacity-85 transition-opacity focus:outline-none">
                  <BrandLogo size="lg" />
                </Link>
              </div>

              {/* Heading */}
              <h1
                className="text-center mb-6 leading-tight select-none"
                style={{
                  fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                  fontSize: '23px',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: '#0A0A0A',
                }}
              >
                Sign in
              </h1>

              {/* OAuth Buttons Stack */}
              <div className="space-y-2.5 mb-5">
                {/* Google */}
                <a
                  href={`/api/auth/google?next=login${selectedPlan ? `&plan=${selectedPlan}&billing=${selectedBilling}` : ''}`}
                  className="w-full h-11 flex items-center justify-center gap-2.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50/80 text-[13.5px] font-medium text-neutral-800 transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.02)] active:scale-[0.99] cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>Continue with Google</span>
                </a>

                {/* GitHub */}
                <a
                  href={`/api/auth/github?next=login${selectedPlan ? `&plan=${selectedPlan}&billing=${selectedBilling}` : ''}`}
                  className="w-full h-11 flex items-center justify-center gap-2.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50/80 text-[13.5px] font-medium text-neutral-800 transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.02)] active:scale-[0.99] cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0 text-neutral-900" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span>Continue with GitHub</span>
                </a>

                {/* X */}
                <a
                  href={`/api/auth/x?next=login${selectedPlan ? `&plan=${selectedPlan}&billing=${selectedBilling}` : ''}`}
                  className="w-full h-11 flex items-center justify-center gap-2.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50/80 text-[13.5px] font-medium text-neutral-800 transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.02)] active:scale-[0.99] cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 shrink-0 text-neutral-900" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>Continue with X</span>
                </a>
              </div>

              {/* Divider */}
              <div className="relative flex items-center justify-center my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200/80" />
                </div>
                <div className="relative bg-white px-3 text-[12px] text-neutral-400 font-normal">
                  or
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                {selectedPlan && <input type="hidden" name="plan" value={selectedPlan} />}
                {selectedPlan && <input type="hidden" name="billing" value={selectedBilling} />}

                <div>
                  <label htmlFor="login-email" className="block text-[12px] font-medium text-neutral-700 mb-1.5 ml-0.5">
                    Email address
                  </label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                    className="w-full h-11 rounded-xl border border-neutral-200 px-3.5 text-[13.5px] text-neutral-900 placeholder:text-neutral-400 bg-neutral-50/50 focus:bg-white focus:outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 transition-all"
                  />
                </div>

                {/* Primary Action Button */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-full bg-[#0c0d0e] hover:bg-[#222222] active:scale-[0.99] text-white font-medium text-[13.5px] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_4px_14px_rgba(0,0,0,0.12)] disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                        <span>Sending code…</span>
                      </>
                    ) : (
                      <>
                        <span>Continue with email</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Account creation info */}
              <div className="mt-5 flex items-start gap-2 text-left text-xs leading-relaxed text-neutral-500">
                <ShieldCheck className="w-3.5 h-3.5 text-neutral-800 shrink-0 mt-0.5" />
                <span>
                  New to BuyerWatch? We&apos;ll automatically set up your account when you continue.
                </span>
              </div>
            </div>
          ) : (
            /* STEP 2: CHECK YOUR EMAIL (6-DIGIT OTP VERIFICATION) - BUYERWATCH THEME */
            <div className="text-center">
              {/* Brand Header */}
              <div className="flex items-center justify-center mb-5">
                <Link href="/" className="inline-flex items-center justify-center hover:opacity-85 transition-opacity focus:outline-none">
                  <BrandLogo size="md" />
                </Link>
              </div>

              {/* BuyerWatch Radar Pulse Icon Badge */}
              <div className="relative inline-flex items-center justify-center mb-4">
                <div className="w-13 h-13 rounded-2xl bg-[#0c0d0e] text-white flex items-center justify-center shadow-[0_8px_20px_rgba(0,0,0,0.14)] ring-4 ring-neutral-100">
                  <Mail className="w-6 h-6 text-white stroke-[2]" />
                </div>
                {/* Live Radar Signal Indicator */}
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white" />
                </span>
              </div>

              {/* Title */}
              <h1
                className="leading-tight select-none"
                style={{
                  fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                  fontSize: '23px',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: '#0A0A0A',
                }}
              >
                Check your email
              </h1>

              {/* Subheading */}
              <p className="mt-2 text-[13px] text-neutral-600 leading-normal">
                Enter the 6-digit verification code sent to{' '}
                <span className="font-semibold text-neutral-900 block break-all mt-0.5">{email || 'your email'}.</span>
              </p>

              {/* Spam Notice Box */}
              <div className="bg-neutral-50/80 border border-neutral-200/80 rounded-2xl p-3.5 flex items-start gap-2.5 text-left text-[12px] text-neutral-600 leading-relaxed my-5">
                <Info className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                <span>
                  Didn&apos;t receive it? Give it a moment, then check your{' '}
                  <strong className="font-semibold text-neutral-900">spam folder</strong>. Codes typically land within seconds.
                </span>
              </div>

              {/* OTP Form with 6 Segmented Individual Digit Cells: [0][0][0] • [0][0][0] */}
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="text-left">
                  <label className="block text-[12px] font-medium text-neutral-700 mb-2 ml-0.5">
                    Verification code
                  </label>

                  <div
                    className="flex items-center justify-between gap-1.5 sm:gap-2"
                    onPaste={handleOtpPaste}
                  >
                    {/* First 3 Digits */}
                    <div className="flex items-center gap-1.5 flex-1 justify-between">
                      {[0, 1, 2].map((idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            otpInputRefs.current[idx] = el
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={otp[idx]}
                          onChange={(e) => handleOtpChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          onFocus={() => setOtpFocused(true)}
                          onBlur={() => setOtpFocused(false)}
                          className="w-10 sm:w-11 h-12 text-center font-mono text-[20px] font-bold text-neutral-900 bg-neutral-50 border border-neutral-200/90 rounded-xl focus:bg-white focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 transition-all outline-none caret-neutral-900 select-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
                        />
                      ))}
                    </div>

                    {/* Middle Radar Divider */}
                    <div className="w-2 h-[2px] bg-neutral-300 rounded-full mx-0.5 shrink-0" />

                    {/* Last 3 Digits */}
                    <div className="flex items-center gap-1.5 flex-1 justify-between">
                      {[3, 4, 5].map((idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            otpInputRefs.current[idx] = el
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={otp[idx]}
                          onChange={(e) => handleOtpChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          onFocus={() => setOtpFocused(true)}
                          onBlur={() => setOtpFocused(false)}
                          className="w-10 sm:w-11 h-12 text-center font-mono text-[20px] font-bold text-neutral-900 bg-neutral-50 border border-neutral-200/90 rounded-xl focus:bg-white focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 transition-all outline-none caret-neutral-900 select-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || otp.join('').length < OTP_LENGTH}
                    className="w-full h-11 rounded-full bg-[#0c0d0e] hover:bg-[#222222] active:scale-[0.99] text-white font-medium text-[13.5px] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_4px_14px_rgba(0,0,0,0.12)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                        <span>Verifying code…</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & continue</span>
                        <ArrowRight className="w-3.5 h-3.5 text-white/80" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Resend & Back Actions */}
              <div className="mt-5 flex flex-col items-center gap-2.5">
                {resendCountdown > 0 ? (
                  <span className="text-[12px] text-neutral-400 select-none">
                    Resend code in <strong className="font-semibold text-neutral-700">{resendCountdown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={resendLoading}
                    onClick={handleResend}
                    className="text-[12.5px] text-neutral-900 hover:text-black font-semibold underline underline-offset-4 cursor-pointer disabled:opacity-50"
                  >
                    {resendLoading ? 'Resending…' : 'Resend code'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setStep('email')
                    setError(null)
                    setSuccessMessage(null)
                  }}
                  className="text-[12.5px] text-neutral-500 hover:text-neutral-900 font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer mt-1"
                >
                  ← Use a different email
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  )

}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-black/10 border-t-black/60 animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
