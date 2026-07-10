'use client'

import { useState } from 'react'
import { signUpAction, signInWithGoogleAction } from '@/app/actions/auth'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Target } from 'lucide-react'
import { springs } from '@/lib/motion'

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
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative">
      <Link href="/" className="absolute top-8 left-8 flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back to home
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.smooth}
        className="w-full max-w-[390px]"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity">
            <Target className="w-8 h-8 text-[#0A84FF]" strokeWidth={2.5} />
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">Join Scouto</h1>
          </Link>
          <p className="text-text-secondary">Create an account to start monitoring</p>
        </div>

        <div className="bg-surface rounded-[24px] py-10 px-8 shadow-elevation-4">
          <form action={signInWithGoogleAction} className="mb-6">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-[#1D1D1F] text-white py-3 rounded-xl font-medium transition-transform hover:scale-[1.01] active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign up with Google
            </button>
          </form>

          <div className="flex items-center gap-4 mb-6">
            <div className="h-[1px] flex-1 bg-black/5"></div>
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">or sign up with email</span>
            <div className="h-[1px] flex-1 bg-black/5"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <input
                name="email"
                type="email"
                placeholder="Email address"
                required
                className="w-full bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-border-hover transition-colors"
              />
            </div>
            <div>
              <input
                name="password"
                type="password"
                placeholder="Password (min 6 chars)"
                required
                className="w-full bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-border-hover transition-colors"
              />
            </div>
            {error && <p className="text-[#FF453A] text-sm text-center">{error}</p>}
            {message && <p className="text-[#30D158] text-sm text-center">{message}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0A84FF] text-text-primary py-3 rounded-xl font-medium transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center mt-8 text-sm text-text-secondary">
          Already have an account?{' '}
          <Link href="/login" className="text-[#0A84FF] hover:underline">
            Log in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
