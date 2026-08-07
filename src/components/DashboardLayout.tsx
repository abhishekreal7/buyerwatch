'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  DocumentTextIcon,
  PresentationChartLineIcon,
  PuzzlePieceIcon,
  CubeIcon,
  FolderIcon,
  IdentificationIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/solid'
import {
  Bell,
  LogOut,
  Menu,
  Search,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { normalizePlan, type PlanTier } from '@/lib/plan-limits'
import {
  BILLING_ADDONS,
  getCurrentUsageMonth,
  getPlanLimitsWithAddons,
  sumMonthlyAddonCredits,
  type BillingAddonType,
} from '@/lib/billing-addons'
import { BrandLogo } from '@/components/BrandLogo'
import { DashboardSessionProvider } from '@/components/DashboardContext'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import {
  ExtensionPriorityNotice,
  ExtensionProvider,
  useExtensionStatus,
} from '@/components/ExtensionInstall'
import { signOutAction } from '@/app/actions/auth'
import { ConversationSearchProvider, useConversationSearch } from '@/lib/conversation-search'

export type DashboardBootstrap = {
  autoSend: boolean
  plan: PlanTier
  credits: { used: number; limit: number }
  hasUnreviewedOpportunities: boolean
  user?: {
    name?: string
    email?: string
    avatarUrl?: string
  }
}

function CustomDashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="235 135 542 538"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Top-left: rounded square */}
      <rect x="300" y="200" width="190" height="190" rx="38" ry="38" fill="currentColor" />

      {/* Top-right: circle */}
      <circle cx="617" cy="295" r="95" fill="currentColor" />

      {/* Bottom-left: rounded square */}
      <rect x="300" y="418" width="190" height="190" rx="38" ry="38" fill="currentColor" />

      {/* Bottom-right: rounded square */}
      <rect x="522" y="418" width="190" height="190" rx="38" ry="38" fill="currentColor" />
    </svg>
  )
}

/** Specific icons for specified items */
const MAIN_NAV_ITEMS = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: CustomDashboardIcon,
  },
  {
    name: 'Drafts Ready',
    href: '/drafts',
    icon: DocumentTextIcon,
  },
  {
    name: 'Analytics',
    href: '/analytics',
    icon: PresentationChartLineIcon,
  },
  {
    name: 'Keywords',
    href: '/keywords',
    icon: PuzzlePieceIcon,
  },
  {
    name: 'Opportunities',
    href: '/opportunities',
    icon: CubeIcon,
  },
  {
    name: 'Posted',
    href: '/posted',
    icon: FolderIcon,
  },
]

const MOBILE_NAV_ITEMS = MAIN_NAV_ITEMS.filter((item) =>
  ['Drafts Ready', 'Analytics', 'Keywords', 'Opportunities'].includes(item.name)
)

type DashboardLayoutProps = {
  children: ReactNode
  userId: string
  initialData: DashboardBootstrap
}

export default function DashboardLayout(props: DashboardLayoutProps) {
  return (
    <ExtensionProvider userId={props.userId}>
      <ConversationSearchProvider>
        <DashboardShell {...props} />
      </ConversationSearchProvider>
    </ExtensionProvider>
  )
}

function DashboardShell({
  children,
  userId,
  initialData,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [supabase] = useState(createClient)

  const [autoSend, setAutoSend] = useState<boolean | null>(initialData.autoSend)
  const [togglingAutoSend, setTogglingAutoSend] = useState(false)
  const [plan, setPlan] = useState<PlanTier>(initialData.plan)
  const [credits, setCredits] = useState<{ used: number; limit: number } | null>(initialData.credits)
  const [opportunityCount, setOpportunityCount] = useState<number | null>(null)
  const [keywordCount, setKeywordCount] = useState<number | null>(null)
  const [openingCheckout, setOpeningCheckout] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { conversationSearch, setConversationSearch } = useConversationSearch()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { status: extensionStatus } = useExtensionStatus()
  const extensionMissing = extensionStatus === 'missing'
  const showConversationSearch = pathname === '/dashboard'

  useEffect(() => {
    const focusSearch = () => searchInputRef.current?.focus()
    window.addEventListener('buyerwatch:focus-conversation-search', focusSearch)
    return () => {
      window.removeEventListener('buyerwatch:focus-conversation-search', focusSearch)
    }
  }, [])

  useEffect(() => {
    if (pathname !== '/dashboard') setConversationSearch('')
  }, [pathname])

  useEffect(() => {
    async function loadSidebarData() {
      const usageMonth = getCurrentUsageMonth()
      const [profileResult, unreviewedResult, keywordCountResult, addonCreditsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('auto_send_enabled, plan, draft_count, draft_month')
          .eq('id', userId)
          .single(),
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', ['pending', 'drafted', 'needs_manual_reply'])
          .is('reviewed_at', null),
        supabase
          .from('keywords')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase
          .from('billing_addon_credits')
          .select('addon_type, credits')
          .eq('user_id', userId)
          .eq('usage_month', usageMonth),
      ])

      const profile = profileResult.data
      if (profile) {
        const normalizedPlan = normalizePlan(profile.plan)
        const addonCredits = sumMonthlyAddonCredits(addonCreditsResult.data)
        const limit = getPlanLimitsWithAddons(normalizedPlan, addonCredits).aiDraftsPerMonth
        const currentMonth = usageMonth
        const used = profile.draft_month === currentMonth
          ? Math.max(profile.draft_count ?? 0, 0)
          : 0
        setAutoSend(profile.auto_send_enabled ?? false)
        setPlan(normalizedPlan)
        setCredits({ used, limit })
      }

      const oppsCount = unreviewedResult.count ?? 0
      setOpportunityCount(oppsCount)
      setKeywordCount(keywordCountResult.count ?? null)
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
    setMobileMenuOpen(false)
  }, [pathname])

  function prepareRoute(href: string) {
    router.prefetch(href)
  }

  async function handleToggleAutoSend() {
    if (autoSend === null || togglingAutoSend) return
    const next = !autoSend

    if (next) {
      router.push('/settings?section=connections')
      toast.info('Review the earned automation controls before activating it.')
      return
    }

    setTogglingAutoSend(true)
    setAutoSend(next)

    const res = await fetch('/api/settings/autosend', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_send_enabled: next }),
    })

    if (!res.ok) {
      setAutoSend(!next)
      toast.error('Failed to update auto-send setting')
    } else {
      clearSupabaseReadCache()
      toast.success(next ? 'Auto-send enabled' : 'Auto-send paused')
      window.dispatchEvent(new CustomEvent('buyerwatch:auto-send-changed', { detail: next }))
    }
    setTogglingAutoSend(false)
  }

  async function openCheckout(body: Record<string, string>, checkoutKey: string) {
    if (openingCheckout) return

    setOpeningCheckout(checkoutKey)
    try {
      // Unique per intentional click so repeat add-on buys are not collapsed
      // by the server's short fallback bucket.
      const idempotencyKey = crypto.randomUUID()
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'checkout_failed')
      }
      window.location.href = payload.url
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      setOpeningCheckout(null)
      if (msg === 'addon_billing_not_configured') {
        toast.error('This add-on is temporarily unavailable. No charge was created.')
      } else if (msg === 'billing_provider_unauthorized') {
        toast.error('Dodo Payments API key is invalid or unauthorized')
      } else if (msg === 'billing_not_configured') {
        toast.error('Billing setup incomplete (missing API key or product IDs)')
      } else {
        toast.error('Billing checkout is not available yet')
      }
    }
  }

  async function handleBuyAddon(type: BillingAddonType) {
    await openCheckout({ addon: type }, `addon:${type}`)
  }

  async function handleAddCredits() {
    if (plan === 'growth') {
      window.location.href = '/pricing'
      return
    }
    await openCheckout({ plan: plan === 'free' ? 'starter' : plan === 'starter' ? 'pro' : 'growth' }, 'upgrade')
  }

  const creditsRemaining = credits ? Math.max(credits.limit - credits.used, 0) : null
  const creditsPercent = credits && credits.limit > 0
    ? Math.max(0, Math.min(100, ((credits.limit - credits.used) / credits.limit) * 100))
    : 0
  const draftAddonAvailable = (plan === 'free' || plan === 'starter') && creditsRemaining === 0

  return (
    <DashboardSessionProvider userId={userId}>
      <div className="h-screen w-screen overflow-hidden bg-[#F7F7F7] p-2 lg:p-2.5 flex gap-2 lg:gap-2.5 text-gray-900 font-sans selection:bg-accent/20 selection:text-accent">

        {/* Desktop Sidebar sitting directly on background */}
        <aside className="hidden w-[205px] shrink-0 flex-col bg-[#F7F7F7] px-2 py-2.5 h-full lg:flex select-none">
          <div className="flex flex-col h-full">
            {/* Logo Header */}
            <div className="mb-2 flex h-9 shrink-0 items-center px-3.5">
              <Link
                href="/dashboard"
                className="flex items-center transition-opacity hover:opacity-80"
              >
                <BrandLogo size="sm" />
              </Link>
            </div>

            {/* Main Navigation Items */}
            <nav className="space-y-1" aria-label="Primary navigation">
              {MAIN_NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
                const IconComp = item.icon as any
                const showExtensionAlert = extensionMissing && ['Keywords', 'Opportunities'].includes(item.name)
                
                // Get count badge data if available
                let badgeCount: number | undefined = undefined
                if (item.name === 'Drafts Ready' && credits) {
                  badgeCount = credits.used
                } else if (item.name === 'Opportunities' && opportunityCount !== null) {
                  badgeCount = opportunityCount
                } else if (item.name === 'Keywords' && keywordCount !== null) {
                  badgeCount = keywordCount
                }

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    prefetch
                    onMouseEnter={() => prepareRoute(item.href)}
                    onFocus={() => prepareRoute(item.href)}
                    onTouchStart={() => prepareRoute(item.href)}
                    aria-current={isActive ? 'page' : undefined}
                    className={
                      isActive
                        ? 'group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-medium text-sm'
                        : 'group flex items-center gap-3 px-3 py-2 rounded-lg text-[#3A3A3A] font-normal text-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors'
                    }
                  >
                    <IconComp className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-zinc-900' : 'text-[#9E9E9E] group-hover:text-[#3A3A3A]'}`} />
                    <span>{item.name}</span>

                    {/* Metadata Badge */}
                    {badgeCount !== undefined && (
                      <span className="ml-auto text-xs text-zinc-400">{badgeCount}</span>
                    )}

                    {showExtensionAlert && badgeCount === undefined && (
                      <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-amber-500" title="Extension setup required" />
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Bottom Group (Settings + Help Center + Profile Card) */}
            <div className="mt-auto flex flex-col gap-3 pt-4">
              <div className="space-y-1">
                {/* Settings Nav Item */}
                <Link
                  href="/settings"
                  prefetch
                  onMouseEnter={() => prepareRoute('/settings')}
                  aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
                  className={
                    pathname.startsWith('/settings')
                      ? 'group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-medium text-sm'
                      : 'group flex items-center gap-3 px-3 py-2 rounded-lg text-[#3A3A3A] font-normal text-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors'
                  }
                >
                  <IdentificationIcon className={`h-5 w-5 shrink-0 transition-colors ${pathname.startsWith('/settings') ? 'text-zinc-900' : 'text-[#9E9E9E] group-hover:text-[#3A3A3A]'}`} />
                  <span>Settings</span>
                </Link>

                {/* Help center */}
                <Link
                  href="/contact"
                  aria-current={pathname.startsWith('/contact') ? 'page' : undefined}
                  className={
                    pathname.startsWith('/contact')
                      ? 'group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-medium text-sm'
                      : 'group flex items-center gap-3 px-3 py-2 rounded-lg text-[#3A3A3A] font-normal text-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors'
                  }
                >
                  <QuestionMarkCircleIcon className={`h-5 w-5 shrink-0 transition-colors ${pathname.startsWith('/contact') ? 'text-zinc-900' : 'text-[#9E9E9E] group-hover:text-[#3A3A3A]'}`} />
                  <span>Help center</span>
                </Link>
              </div>

              {/* Restyled Profile Card */}
              <div className="rounded-xl border border-zinc-200 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={initialData.user?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                      alt={initialData.user?.name || 'User'}
                      className="h-8 w-8 shrink-0 rounded-full object-cover border border-zinc-200"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-900 leading-tight">
                        {initialData.user?.name || 'User'}
                      </p>
                      <p className="truncate text-[11px] text-zinc-500 capitalize">
                        {plan} Plan
                      </p>
                    </div>
                  </div>
                  <form action={signOutAction} className="shrink-0">
                    <button
                      type="submit"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
                      title="Sign out"
                      aria-label="Sign out"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </form>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Usage</span>
                    <span className="font-medium text-zinc-700">
                      {credits ? `${creditsRemaining} left` : ''}
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100"
                    role="progressbar"
                    aria-label="Monthly drafts remaining"
                    aria-valuemin={0}
                    aria-valuemax={credits?.limit || 100}
                    aria-valuenow={creditsRemaining || 0}
                  >
                    <div
                      className="h-full rounded-full bg-zinc-900 transition-all duration-300"
                      style={{ width: `${creditsPercent}%` }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={draftAddonAvailable ? () => void handleBuyAddon('drafts') : handleAddCredits}
                  disabled={Boolean(openingCheckout)}
                  className="w-full rounded-lg bg-zinc-900 text-white text-sm font-medium py-2 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {openingCheckout
                    ? 'Opening checkout...'
                    : draftAddonAvailable
                      ? BILLING_ADDONS.drafts.ctaLabel
                      : 'Upgrade Plan'}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content App Panel (Untouched) */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-white rounded-2xl border border-[#E2E2DE] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          {/* Header Bar */}
          <header className="flex h-14 shrink-0 items-center justify-between bg-white px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              {showConversationSearch && (
              <div className="relative hidden w-64 sm:block">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={conversationSearch}
                  onChange={(e) => setConversationSearch(e.target.value)}
                  placeholder="Search conversations…"
                  className="h-9 w-full rounded-xl bg-[#F4F4F2] pl-9 pr-3 text-xs text-gray-900 placeholder-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/25"
                />
              </div>
              )}
            </div>

            <div className="flex items-center gap-2">
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

          {/* Content Container */}
          <div className="scrollbar-gutter-stable relative z-10 w-full flex-1 min-h-0 overflow-y-scroll px-4 py-5 pb-[104px] sm:px-6 sm:py-6 lg:px-8 lg:pb-8">
            {extensionMissing && ['/dashboard', '/keywords', '/opportunities'].some((href) => pathname === href || pathname.startsWith(`${href}/`)) && (
              <ExtensionPriorityNotice />
            )}
            {children}
          </div>

          {/* Mobile Nav Drawer */}
          <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/[0.06] bg-white/95 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
            <div className="flex items-center justify-around px-2 h-[64px] pt-1">
              {MOBILE_NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const IconComp = item.icon as any
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    prefetch
                    onMouseEnter={() => prepareRoute(item.href)}
                    onFocus={() => prepareRoute(item.href)}
                    onTouchStart={() => prepareRoute(item.href)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 ${
                      isActive ? 'text-[#0A84FF]' : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <div className="relative grid h-5 w-5 place-items-center">
                      <IconComp className="h-4.5 w-4.5 text-current" />
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
                  mobileMenuOpen || ['/dashboard', '/posted', '/settings'].some((href) => pathname.startsWith(href))
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
                  { name: 'Dashboard', href: '/dashboard', icon: CustomDashboardIcon, isHeroicon: true },
                  { name: 'Posted replies', href: '/posted', icon: FolderIcon, isHeroicon: true },
                  { name: 'Settings', href: '/settings', icon: IdentificationIcon, isHeroicon: true },
                ].map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const IconComp = item.icon as any
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onMouseEnter={() => prepareRoute(item.href)}
                      onFocus={() => prepareRoute(item.href)}
                      onTouchStart={() => prepareRoute(item.href)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${
                        isActive ? 'bg-blue-50 text-[#0A84FF]' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {item.isHeroicon ? (
                        <IconComp className="h-4.5 w-4.5" />
                      ) : (
                        <IconComp size={18} strokeWidth={2} />
                      )}
                      {item.name}
                    </Link>
                  )
                })}
                <form action={signOutAction} className="border-t border-gray-100 pt-2">
                  <button
                    type="submit"
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4.5 w-4.5" strokeWidth={2} />
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
