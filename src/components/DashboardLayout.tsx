'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell,
  ChevronRight,
  FolderClosed,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  Settings,
  X,
} from 'lucide-react'
import {
  PiArrowLeftBold,
  PiQuestionFill,
} from 'react-icons/pi'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { getPlanLimits, normalizePlan, type PlanTier } from '@/lib/plan-limits'
import { BrandLogo } from '@/components/BrandLogo'
import { DashboardSessionProvider } from '@/components/DashboardContext'
import {
  ReferenceAnalyticsIcon,
  ReferenceBreadcrumbCurrentIcon,
  ReferenceBreadcrumbFolderIcon,
  ReferenceCubeIcon,
  ReferenceDashboardIcon,
  ReferenceFolderIcon,
  ReferencePostedIcon,
  ReferencePuzzleIcon,
} from '@/components/SidebarReferenceIcons'

export type DashboardBootstrap = {
  autoSend: boolean
  plan: PlanTier
  credits: { used: number; limit: number }
  opportunityCount: number
  draftCount: number
  user?: {
    name?: string
    email?: string
    avatarUrl?: string
  }
}

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, sidebarIcon: ReferenceDashboardIcon },
  { name: 'Drafts Ready', href: '/drafts', icon: FolderClosed, sidebarIcon: ReferenceFolderIcon },
  { name: 'Analytics', href: '/analytics', icon: ReferenceAnalyticsIcon, sidebarIcon: ReferenceAnalyticsIcon },
  { name: 'Keywords', href: '/keywords', icon: ReferencePuzzleIcon, sidebarIcon: ReferencePuzzleIcon },
  { name: 'Opportunities', href: '/opportunities', icon: Package, sidebarIcon: ReferenceCubeIcon },
  { name: 'Posted', href: '/posted', icon: ReferencePostedIcon, sidebarIcon: ReferencePostedIcon },
]

const PAGE_SECTIONS: Record<string, string> = {
  '/dashboard': 'Workspace',
  '/opportunities': 'Lead discovery',
  '/drafts': 'Outreach',
  '/posted': 'Outreach',
  '/analytics': 'Insights',
  '/keywords': 'Monitoring',
  '/settings': 'Account',
}

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ['Drafts Ready', 'Analytics', 'Keywords', 'Opportunities'].includes(item.name)
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
    window.addEventListener('buyerwatch:credits-changed', refreshCredits)
    return () => {
      window.clearInterval(refreshInterval)
      window.removeEventListener('buyerwatch:credits-changed', refreshCredits)
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
      window.dispatchEvent(new CustomEvent('buyerwatch:auto-send-changed', { detail: next }))
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
  const currentNavItem = NAV_ITEMS.find((item) =>
    pathname === item.href || pathname.startsWith(`${item.href}/`)
  )
  const currentPage = currentNavItem?.name ?? (pathname.startsWith('/settings') ? 'Settings' : 'Overview')
  const currentSection = Object.entries(PAGE_SECTIONS).find(([href]) =>
    pathname === href || pathname.startsWith(`${href}/`)
  )?.[1] ?? 'Workspace'
  function openCommandPalette() {
    window.dispatchEvent(new Event('buyerwatch:open-command-palette'))
  }

  return (
    <DashboardSessionProvider userId={userId}>
      {/* Outer App Canvas — Fits 100% viewport screen */}
      <div className="h-screen w-screen overflow-hidden bg-[#F4F4F2] p-2 lg:p-2.5 flex gap-2 lg:gap-2.5 text-gray-900 font-sans selection:bg-accent/20 selection:text-accent">

        {/* Desktop Sidebar sitting directly on warm stone background */}
        <aside className="hidden w-[205px] shrink-0 flex-col bg-[#F4F4F2] px-2 py-2.5 h-full lg:flex select-none">
          <div className="flex flex-col h-full">
            {/* Logo Header */}
            <div className="mb-2 flex h-9 shrink-0 items-center px-1.5">
              <Link
                href="/dashboard"
                className="flex items-center text-[18px] font-bold tracking-[-0.03em] text-[#1C1C1A] transition-opacity hover:opacity-75"
              >
                <BrandLogo size="sm" />
              </Link>
            </div>

            {/* Navigation Items */}
            <nav className="space-y-0.5" aria-label="Primary navigation">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const badge = badges[item.href]
                const SidebarIcon = item.sidebarIcon
                return (
                  <div key={item.name}>
                    <Link
                      href={item.href}
                      onMouseEnter={() => router.prefetch(item.href)}
                      onFocus={() => router.prefetch(item.href)}
                      className={`group flex h-9 items-center justify-between rounded-[10px] px-3 text-[13.5px] transition-all duration-150 ${isActive
                          ? 'border border-[#E2E2DE] bg-white font-semibold text-[#111110] shadow-[0_1px_2.5px_rgba(0,0,0,0.035)]'
                          : 'border border-transparent font-medium text-[#5D5D57] hover:bg-[#EBEBE8] hover:text-[#1C1C1A]'
                        }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <SidebarIcon
                          aria-hidden
                          className={`h-[20px] w-[20px] shrink-0 transition-colors ${isActive ? 'text-[#111110]' : 'text-[#3B3B37] group-hover:text-[#111110]'
                            }`}
                        />
                        <span className="truncate">{item.name}</span>
                      </span>
                      {badge != null && badge > 0 && (
                        <span
                          className={`ml-2 shrink-0 text-[12px] tabular-nums ${item.name === 'Opportunities'
                              ? 'rounded-full bg-[#EF4444] text-white font-bold px-1.5 py-0.2 min-w-[18px] text-center text-[10.5px]'
                              : 'font-normal text-[#888883]'
                            }`}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  </div>
                )
              })}
            </nav>

            {/* Bottom Navigation & Unified User Widget grouped with mt-auto */}
            <div className="mt-auto shrink-0 flex flex-col gap-2 pt-3">
              <Link
                href="/contact"
                className="group flex h-8 items-center gap-2 rounded-xl px-2.5 text-[13px] font-medium text-[#5D5D57] transition-colors hover:bg-[#EAEAE7] hover:text-[#1C1C1A]"
              >
                <PiQuestionFill className="h-[16px] w-[16px] text-[#7D7D77] group-hover:text-[#2C2C28]" aria-hidden />
                Help center
              </Link>

              {/* Unified Professional Profile & Usage Card */}
              <div className="rounded-[16px] border border-[#E2E2DE] bg-white p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col gap-2">
                {/* User Info Row */}
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href="/settings"
                    className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg transition-opacity hover:opacity-80"
                    title="Account Settings"
                  >
                    <img
                      src={initialData.user?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                      alt={initialData.user?.name || 'User'}
                      className="h-7.5 w-7.5 shrink-0 rounded-full object-cover border border-black/5 shadow-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-[#1C1C1A] leading-tight">
                        {initialData.user?.name || 'User'}
                      </p>
                      <p className="truncate text-[10px] font-medium text-[#82827D] capitalize">
                        {plan} Plan
                      </p>
                    </div>
                  </Link>

                  <form action="/api/auth/signout" method="POST" className="shrink-0">
                    <button
                      type="submit"
                      className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-[#7C7C76] transition-colors hover:bg-black/5 hover:text-[#1C1C1A]"
                      title="Sign out"
                      aria-label="Sign out"
                    >
                      <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </form>
                </div>

                {/* Muted Divider */}
                <div className="h-px w-full bg-[#EAEAE7]" />

                {/* Usage & Upgrade Section */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10.5px] font-medium text-[#686863]">
                    <span>Usage</span>
                    <span className="font-semibold text-[#1C1C1A]">
                      {credits ? `${creditsRemaining} drafts left` : 'Checking'}
                    </span>
                  </div>

                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-[#EFEFEA]"
                    role="progressbar"
                    aria-label="Monthly drafts remaining"
                    aria-valuemin={0}
                    aria-valuemax={credits?.limit ?? 0}
                    aria-valuenow={creditsRemaining ?? 0}
                  >
                    <div
                      className="h-full rounded-full bg-[#1687E8] transition-[width] duration-300"
                      style={{ width: `${creditsPercent}%` }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCredits}
                    disabled={openingCheckout}
                    className="mt-0.5 flex h-7 w-full items-center justify-center rounded-lg bg-[#1C1C1A] px-2 text-[11px] font-semibold text-white shadow-xs transition-colors hover:bg-black disabled:cursor-wait disabled:bg-[#A7A7A2]"
                  >
                    {openingCheckout
                      ? 'Opening checkout…'
                      : plan === 'growth'
                        ? 'Manage Subscription'
                        : plan === 'free'
                          ? 'Upgrade Plan'
                          : 'Add Credits'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Workspace Window Panel — Floating rounded white card (Image 1 design) */}
        <main className="flex-1 h-full bg-white rounded-none sm:rounded-[20px] lg:rounded-[24px] border border-[#E5E5E2] shadow-[0_4px_24px_rgba(0,0,0,0.035),0_1px_4px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
          <header className="sticky top-0 z-20 flex h-[56px] shrink-0 items-center justify-between bg-white px-4 sm:px-6">
            <div className="flex min-w-0 items-center text-[12.5px] font-medium tracking-normal text-[#50504C]">
              <button
                type="button"
                onClick={() => router.back()}
                className="mr-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#343431] transition-colors hover:bg-black/[0.045]"
                aria-label="Go back"
                title="Go back"
              >
                <PiArrowLeftBold className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span className="mr-3 h-4 w-px shrink-0 bg-[#E3E3E0]" aria-hidden />
              <div className="hidden min-w-0 items-center sm:flex">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <ReferenceBreadcrumbFolderIcon className="h-[15px] w-[15px] text-[#8B8E8A]" aria-hidden />
                  BuyerWatch
                </span>
                <ChevronRight className="mx-1.5 h-3 w-3 shrink-0 text-[#B8B8B4]" strokeWidth={1.8} aria-hidden />
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <ReferenceBreadcrumbFolderIcon className="h-[15px] w-[15px] text-[#8B8E8A]" aria-hidden />
                  {currentSection}
                </span>
                <ChevronRight className="mx-1.5 h-3 w-3 shrink-0 text-[#B8B8B4]" strokeWidth={1.8} aria-hidden />
              </div>
              <span className="flex min-w-0 items-center gap-1.5 font-semibold text-[#343431]">
                <ReferenceBreadcrumbCurrentIcon className="h-[18px] w-[18px] shrink-0 text-[#343431]" aria-hidden />
                <span className="truncate">{currentPage}</span>
              </span>
            </div>

            <div className="ml-3 flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={openCommandPalette}
                className="group relative hidden h-9 w-[238px] items-center rounded-[10px] border border-[#DCDCD8] bg-white pl-9 pr-3 text-left text-[12.5px] font-medium text-[#62625E] shadow-[0_1px_2px_rgba(0,0,0,0.045)] transition-colors hover:bg-[#F8F8F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/25 xl:flex"
                aria-label="Open search and command menu"
              >
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7D7D78] transition-colors group-hover:text-[#555551]" strokeWidth={1.9} />
                <span className="truncate">Search or jump to...</span>
                <span className="ml-auto rounded-[6px] border border-[#D8D8D4] bg-white px-1.5 text-[9.5px] font-semibold leading-[18px] text-[#73736E] shadow-[0_1px_1px_rgba(0,0,0,0.04)]">
                  Ctrl K
                </span>
              </button>

              <button
                type="button"
                onClick={openCommandPalette}
                className="flex h-11 w-11 items-center justify-center rounded-[9px] border border-[#E2E2DF] bg-[#FAFAF9] text-[#666662] transition-colors hover:bg-[#F5F5F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/25 sm:h-8 sm:w-8 lg:hidden"
                aria-label="Open search and command menu"
              >
                <Search className="h-3.5 w-3.5" strokeWidth={1.9} />
              </button>

              <div className="hidden h-4 w-px bg-[#E3E3E0] sm:block lg:hidden" />

              {/* Clean Auto-send toggle */}
              {autoSend !== null && (
                <button
                  type="button"
                  onClick={handleToggleAutoSend}
                  disabled={togglingAutoSend}
                  title={autoSend ? 'Auto-send is active — click to pause' : 'Auto-send is paused — click to resume'}
                  className="flex h-11 cursor-pointer items-center gap-2 rounded-[9px] border border-[#E2E2DF] bg-[#FAFAF9] px-2.5 transition-colors hover:bg-[#F5F5F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/25 sm:h-8"
                  aria-pressed={autoSend}
                >
                  <span className="hidden select-none text-[11px] font-medium text-[#555552] sm:inline">
                    Auto-send
                  </span>
                  <div className={`relative h-4 w-7 rounded-full transition-colors duration-200 ${autoSend ? 'bg-emerald-500' : 'bg-[#D1D1CD]'}`}>
                    <div className={`absolute left-[2px] top-[2px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${autoSend ? 'translate-x-3' : 'translate-x-0'}`} />
                  </div>
                </button>
              )}

              {/* Bell Icon */}
              <button
                type="button"
                onClick={() => toast.success("You're all caught up", { description: 'No new notifications right now.' })}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[9px] border border-[#E2E2DF] bg-[#FAFAF9] text-[#666662] transition-colors hover:bg-[#F5F5F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/25 sm:h-8 sm:w-8"
                title="Notifications"
                aria-label="View notifications"
              >
                <Bell className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            </div>
          </header>

          {/* Content Container — Smooth independent vertical scroll */}
          <div className="relative z-10 w-full flex-1 min-h-0 overflow-y-auto px-4 py-5 pb-[104px] sm:px-6 sm:py-6 lg:px-8 lg:pb-8">
            {children}
          </div>

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
                className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 ${mobileMenuOpen || ['/dashboard', '/posted', '/settings'].some((href) => pathname.startsWith(href))
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
                  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
                  { name: 'Posted replies', href: '/posted', icon: ReferencePostedIcon },
                  { name: 'Settings', href: '/settings', icon: Settings },
                ].map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onTouchStart={() => router.prefetch(item.href)}
                      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${isActive ? 'bg-blue-50 text-[#0A84FF]' : 'text-gray-700 hover:bg-gray-50'
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
        </main>
      </div>
    </DashboardSessionProvider>
  )
}
