'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { BrandLogo } from '@/components/BrandLogo'
import Link from 'next/link'
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { afterAuthenticationDestination } from '@/lib/billing-selection'

interface Props {
  selectedPlan?: string
  selectedBilling?: string
}

export function ConfirmClientHandler({ selectedPlan, selectedBilling }: Props) {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    async function handleAuth() {
      try {
        // First check if Supabase has already parsed session from hash or cookies
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          if (!mounted) return
          setStatus('error')
          setErrorMessage(error.message)
          return
        }

        if (session?.user) {
          if (!mounted) return
          setStatus('success')
          completeRedirect(session.user.id)
          return
        }

        // If no session yet, listen to auth state changes (e.g. as Supabase parses the hash fragment)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          if (!mounted) return
          if (event === 'SIGNED_IN' && currentSession?.user) {
            setStatus('success')
            completeRedirect(currentSession.user.id)
          } else if (event === 'USER_UPDATED' && currentSession?.user) {
            setStatus('success')
            completeRedirect(currentSession.user.id)
          }
        })

        // Safety timeout: if nothing happens within 5 seconds and no session, flag expired/invalid
        const timer = setTimeout(() => {
          if (!mounted) return
          supabase.auth.getSession().then(({ data }) => {
            if (data?.session?.user) {
              setStatus('success')
              completeRedirect(data.session.user.id)
            } else {
              setStatus('error')
              setErrorMessage('This sign-in link has expired or has already been used.')
            }
          })
        }, 5000)

        return () => {
          subscription.unsubscribe()
          clearTimeout(timer)
        }
      } catch (err: unknown) {
        if (!mounted) return
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed')
      }
    }

    async function completeRedirect(userId: string) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, business_name')
          .eq('id', userId)
          .maybeSingle()

        const hasOnboarded = Boolean(profile?.business_name)
        const destination = afterAuthenticationDestination(selectedPlan, hasOnboarded, selectedBilling)
        window.location.replace(destination)
      } catch {
        window.location.replace('/dashboard')
      }
    }

    handleAuth()

    return () => {
      mounted = false
    }
  }, [selectedPlan, selectedBilling])

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-center items-center p-4 sm:p-6 relative selection:bg-neutral-900 selection:text-white font-sans"
      style={{
        background: 'radial-gradient(circle at 50% 0%, #f4f3ef 0%, #ffffff 55%)',
      }}
    >
      <div className="w-full max-w-[396px] z-10 my-auto">
        <div className="bg-white rounded-3xl p-8 border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_40px_rgba(0,0,0,0.06)] text-center">
          <div className="flex items-center justify-center mb-6">
            <Link href="/" className="inline-flex items-center justify-center">
              <BrandLogo size="md" />
            </Link>
          </div>

          {status === 'verifying' && (
            <div className="space-y-4 py-4">
              <div className="relative inline-flex items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-[#0c0d0e] text-white flex items-center justify-center shadow-md">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white" />
                </span>
              </div>
              <h2 className="text-[19px] font-bold text-neutral-900 tracking-[-0.02em]">
                Signing you in…
              </h2>
              <p className="text-[13px] text-neutral-500 leading-normal">
                Verifying your secure session and connecting to your workspace.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4 py-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-md">
                <ArrowRight className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-[19px] font-bold text-neutral-900 tracking-[-0.02em]">
                Authenticated
              </h2>
              <p className="text-[13px] text-neutral-500 leading-normal">
                Redirecting to your dashboard…
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4 py-2">
              <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-[19px] font-bold text-neutral-900 tracking-[-0.02em]">
                Unable to sign in
              </h2>
              <p className="text-[13px] text-neutral-600 leading-normal">
                {errorMessage || 'This sign-in link has expired or has already been used.'}
              </p>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="w-full h-10 rounded-full bg-[#0c0d0e] hover:bg-neutral-800 text-white text-[13px] font-semibold inline-flex items-center justify-center transition-all cursor-pointer"
                >
                  Request a new sign-in link
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
