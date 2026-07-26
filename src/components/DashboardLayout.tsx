'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell,
  ChartNoAxesCombined,
  CheckCircle,
  ChevronRight,
  FileText,
  Key,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Target,
  X,
  Zap,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { getPlanLimits, normalizePlan, type PlanTier } from '@/lib/plan-limits'
import { BrandLogo } from '@/components/BrandLogo'
import { DashboardSessionProvider } from '@/components/DashboardContext'

export type DashboardBootstrap = {
  autoSend: boolean
  plan: PlanTier
  credits: { used: number; limit: number }
  opportunityCount: number
  draftCount: number
}

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Opportunities', href: '/opportunities', icon: Target },
  { name: 'Drafts Ready', href: '/drafts', icon: FileText },
  { name: 'Posted', href: '/posted', icon: CheckCircle },
  { name: 'Analytics', href: '/analytics', icon: ChartNoAxesCombined },
  { name: 'Keywords', href: '/keywords', icon: Key },
]

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ['Dashboard', 'Opportunities', 'Drafts Ready', 'Analytics'].includes(item.name)
)

export default function DashboardLayout({
  children,
  userId,
  initialData,
}: {
  children: ReactNode
  userId: string
  initialData: DashboardBootstrap
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [supabase] = useState(createClient)

  const [autoSend, setAutoSend] = useState<boolean | null>(initialData.autoSend)
  const [togglingAutoSend, setTogglingAutoSend] = useState(false)
  const [opportunityCount, setOpportunityCount] = useState<number | null>(initialData.opportunityCount)
  const [draftCount, setDraftCount] = useState<number | null>(initialData.draftCount)
  const [plan, setPlan] = useState<PlanTier>(initialData.plan)
  const [credits, setCredits] = useState<{ used: number; limit: number } | null>(initialData.credits)
  const [openingCheckout, setOpeningCheckout] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    async function loadSidebarData() {
      // Profile — auto-send state
      const [profileResult, opportunitiesResult, draftsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('auto_send_enabled, plan, draft_count, draft_month')
          .eq('id', userId)
          .single(),
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', ['pending', 'needs_manual_reply']),
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'drafted'),
      ])
      const profile = profileResult.data
      if (profile) {
        const normalizedPlan = normalizePlan(profile.plan)
        const limit = getPlanLimits(normalizedPlan).aiDraftsPerMonth
        const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`
        const used = profile.draft_month === currentMonth
          ? Math.min(Math.max(profile.draft_count ?? 0, 0), limit)
          : 0
        setAutoSend(profile.auto_send_enabled ?? false)
        setPlan(normalizedPlan)
        setCredits({ used, limit })
      }

      setOpportunityCount(opportunitiesResult.count ?? 0)
      setDraftCount(draftsResult.count ?? 0)
    }
    const refreshCredits = () => void loadSidebarData()
    const refreshInterval = window.setInterval(loadSidebarData, 60_000)
    window.addEventListener('scouto:credits-changed', refreshCredits)
    return () => {
      window.clearInterval(refreshInterval)
      window.removeEventListener('scouto:credits-changed', refreshCredits)
    }
  }, [supabase, userId])

  useEffect(() => {
    const prefetchRoutes = () => {
      for (const item of NAV_ITEMS) {
        if (item.href !== pathname) router.prefetch(item.href)
      }
      router.prefetch('/settings')
    }

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(prefetchRoutes, { timeout: 1_500 })
      return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = globalThis.setTimeout(prefetchRoutes, 250)
    return () => globalThis.clearTimeout(timeoutId)
  }, [pathname, router])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  async function handleToggleAutoSend() {
    if (autoSend === null || togglingAutoSend) return
    const next = !autoSend
    setTogglingAutoSend(true)
    setAutoSend(next) // optimistic

    const res = await fetch('/api/settings/autosend', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_send_enabled: next }),
    })

    if (!res.ok) {
      setAutoSend(!next) // revert
      toast.error('Failed to update auto-send setting')
    } else {
      toast.success(next ? 'Auto-send enabled' : 'Auto-send paused')
      window.dispatchEvent(new CustomEvent('scouto:auto-send-changed', { detail: next }))
    }
    setTogglingAutoSend(false)
  }

  async function handleAddCredits() {
    if (openingCheckout) return
    if (plan === 'growth') {
      window.location.href = '/pricing'
      return
    }

    setOpeningCheckout(true)
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan === 'free' ? 'pro' : 'growth' }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'checkout_failed')
      }
      window.location.href = payload.url
    } catch {
      toast.error('Billing checkout is not available yet')
      setOpeningCheckout(false)
    }
  }

  const badges: Record<string, number | null> = {
    '/opportunities': opportunityCount,
    '/drafts': draftCount,
  }
  const creditsRemaining = credits ? Math.max(credits.limit - credits.used, 0) : null
  const creditsPercent = credits && credits.limit > 0
    ? Math.max(0, Math.min(100, ((credits.limit - credits.used) / credits.limit) * 100))
    : 0
  const currentPage = NAV_ITEMS.find((item) =>
    pathname === item.href || pathname.startsWith(`${item.href}/`)
  )?.name ?? (pathname.startsWith('/settings') ? 'Settings' : 'Overview')

  function openCommandPalette() {
    window.dispatchEvent(new Event('scouto:open-command-palette'))
  }

  return (
    <DashboardSessionProvider userId={userId}>
      <div className="min-h-screen bg-[#FAFAFA] relative selection:bg-accent/20 selection:text-accent font-sans text-gray-900">
      {/* Sidebar - ElevenLabs Style */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden h-screen w-[260px] shrink-0 flex-col border-r border-gray-200/70 bg-[#F9FAFB] px-3 py-4 lg:flex">
        {/* Logo & Brand Header */}
        <div className="h-12 flex items-center px-2 shrink-0 mb-2">
          <Link href="/dashboard" className="text-xl font-display font-bold tracking-tight text-gray-900 flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <BrandLogo />
          </Link>
        </div>

        {/* Main Nav Section */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto no-scrollbar">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const badge = badges[item.href]
            return (
              <Link
                key={item.name}
                href={item.href}
                onMouseEnter={() => router.prefetch(item.href)}
                onFocus={() => router.prefetch(item.href)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl transition-colors text-[13.5px] ${isActive
                  ? 'bg-[#EAEAEA] text-gray-900 font-semibold'
                  : 'text-[#555555] hover:bg-[#F2F2F2] hover:text-gray-900 font-medium'
                  }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-gray-900' : 'text-gray-500'}`} strokeWidth={1.8} />
                  <span className="truncate">{item.name}</span>
                </div>
                {badge != null && badge > 0 && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-1 tabular-nums ${isActive ? 'bg-gray-300/70 text-gray-900' : 'bg-gray-200/70 text-gray-600'
                    }`}>
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* ElevenLabs Style Bottom Profile / Card Box */}
        <div className="pt-2 shrink-0 space-y-2">
          {/* Credits Allowance Widget */}
          <div className="bg-gradient-to-b from-gray-50 to-white rounded-2xl border border-gray-200/80 p-3 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#0A84FF]" strokeWidth={2.2} />
                <span className="text-[11.5px] font-bold text-gray-900 tracking-tight">Credits</span>
              </div>
              <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {credits ? `${creditsRemaining} / ${credits.limit} left` : 'Loading'}
              </span>
            </div>

            <div className="w-full bg-gray-200/70 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#0A84FF] h-full rounded-full transition-all duration-300"
                style={{ width: `${creditsPercent}%` }}
              />
            </div>

            <button
              type="button"
              onClick={handleAddCredits}
              disabled={openingCheckout}
              className="flex min-h-9 w-full items-center justify-center gap-1 rounded-xl bg-gray-900 py-1 text-[11px] font-semibold text-white shadow-2xs transition-all hover:bg-black disabled:bg-gray-400"
            >
              {openingCheckout ? 'Opening checkout…' : plan === 'growth' ? 'View usage options' : '+ Add Credits'}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-2xs">
            <div className="flex items-center justify-between gap-2 group">
              <Link href="/settings" className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs">
                  S
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12.5px] font-semibold text-gray-900 truncate leading-tight group-hover:text-[#0A84FF] transition-colors">Settings &amp; Profile</span>
                  <span className="text-[10.5px] text-gray-400 truncate">
                    {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
                  </span>
                </div>
              </Link>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Container - Offset by fixed sidebar width */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-[260px]">
        {/* ElevenLabs Style Top Bar Header with Breadcrumbs */}
        <header className="sticky top-0 z-20 flex h-[60px] shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          {/* Breadcrumb Context */}
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <span className="hidden text-gray-400 sm:inline">Scouto</span>
            <ChevronRight className="hidden h-3.5 w-3.5 text-gray-300 sm:block" />
            <span className="text-gray-800 font-semibold">
              {currentPage}
            </span>
          </div>

          {/* Search Bar & Auto-send / Notification Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={openCommandPalette}
              className="group relative hidden w-60 cursor-pointer items-center rounded-xl border border-gray-200/80 bg-gray-50/80 py-2 pl-8 pr-4 text-left text-xs font-medium text-gray-400 transition-all hover:bg-gray-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 xl:flex"
              aria-label="Open search and command menu"
            >
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none group-focus-within:text-[#0A84FF] transition-colors" strokeWidth={2.2} />
              Search or jump to...
            </button>

            <button
              type="button"
              onClick={openCommandPalette}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200/70 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 xl:hidden"
              aria-label="Open search and command menu"
            >
              <Search className="h-4 w-4" strokeWidth={1.9} />
            </button>

            <div className="hidden h-4 w-px bg-gray-200 sm:block" />

            {/* Clean Auto-send toggle */}
            {autoSend !== null && (
              <button
                type="button"
                onClick={handleToggleAutoSend}
                disabled={togglingAutoSend}
                title={autoSend ? 'Auto-send is active — click to pause' : 'Auto-send is paused — click to resume'}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-gray-200/70 bg-gray-50 px-2.5 py-1 transition-all hover:bg-gray-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30"
                aria-pressed={autoSend}
              >
                <span className="hidden select-none text-xs font-medium text-gray-700 sm:inline">
                  Auto-send
                </span>
                <div className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${autoSend ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow-sm transition-transform duration-200 ${autoSend ? 'translate-x-[14px]' : 'translate-x-0'}`} />
                </div>
              </button>
            )}

            {/* Bell Icon */}
            <button
              type="button"
              onClick={() => toast.success("You're all caught up", { description: 'No new notifications right now.' })}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-gray-200/70 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30"
              title="Notifications"
              aria-label="View notifications"
            >
              <Bell className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="relative z-10 mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 pb-[104px] sm:px-6 sm:py-6 lg:px-8 lg:pb-8">
          {children}
        </main>

        {/* Mobile Nav */}
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/[0.06] bg-white/95 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
          <div className="flex items-center justify-around px-2 h-[64px] pt-1">
            {MOBILE_NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              const badge = badges[item.href]
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onTouchStart={() => router.prefetch(item.href)}
                  className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 ${isActive ? 'text-[#0A84FF]' : 'text-gray-400 hover:text-gray-700'
                    }`}
                >
                  <div className="relative">
                    <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.8} />
                    {badge != null && badge > 0 && (
                      <span className="absolute -top-1 -right-2 w-4 h-4 bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-white">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{item.name.split(' ')[0]}</span>
                </Link>
              )
            })}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-more-menu"
              className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 ${
                mobileMenuOpen || ['/posted', '/keywords', '/settings'].some((href) => pathname.startsWith(href))
                  ? 'text-[#0A84FF]'
                  : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </nav>

        {mobileMenuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/15 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
            />
            <div
              id="mobile-more-menu"
              className="fixed inset-x-3 bottom-[76px] z-50 overflow-hidden rounded-2xl border border-black/10 bg-white p-2 shadow-[0_20px_60px_rgba(0,0,0,0.16)] lg:hidden"
            >
              {[
                { name: 'Posted replies', href: '/posted', icon: CheckCircle },
                { name: 'Keywords', href: '/keywords', icon: Key },
                { name: 'Settings', href: '/settings', icon: Settings },
              ].map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onTouchStart={() => router.prefetch(item.href)}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${
                      isActive ? 'bg-blue-50 text-[#0A84FF]' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <item.icon className="h-4.5 w-4.5" />
                    {item.name}
                  </Link>
                )
              })}
              <form action="/api/auth/signout" method="POST" className="border-t border-gray-100 pt-2">
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut className="h-4.5 w-4.5" />
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}
        </div>
      </div>
    </DashboardSessionProvider>
  )
}
