'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Target, FileText, CheckCircle, ChartNoAxesCombined, Key, Bell, Search, LogOut, User, ChevronRight, ChevronDown, Zap } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Opportunities', href: '/opportunities', icon: Target },
  { name: 'Drafts Ready', href: '/drafts', icon: FileText },
  { name: 'Posted', href: '/posted', icon: CheckCircle },
  { name: 'Analytics', href: '/analytics', icon: ChartNoAxesCombined },
  { name: 'Keywords', href: '/keywords', icon: Key },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const supabase = createClient()

  const [autoSend, setAutoSend] = useState<boolean | null>(null)
  const [togglingAutoSend, setTogglingAutoSend] = useState(false)
  const [opportunityCount, setOpportunityCount] = useState<number | null>(null)
  const [draftCount, setDraftCount] = useState<number | null>(null)

  useEffect(() => {
    async function loadSidebarData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Profile — auto-send state
      const { data: profile } = await supabase
        .from('profiles')
        .select('auto_send_enabled')
        .eq('id', user.id)
        .single()
      if (profile) setAutoSend(profile.auto_send_enabled ?? false)

      // Real badge counts
      const [opportunitiesRes, draftsRes] = await Promise.all([
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('status', ['pending', 'needs_manual_reply']),
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'drafted'),
      ])
      setOpportunityCount(opportunitiesRes.count ?? 0)
      setDraftCount(draftsRes.count ?? 0)
    }
    loadSidebarData()
  }, [])

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
    }
    setTogglingAutoSend(false)
  }

  const badges: Record<string, number | null> = {
    '/opportunities': opportunityCount,
    '/drafts': draftCount,
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative selection:bg-accent/20 selection:text-accent font-sans text-gray-900">
      {/* Sidebar - ElevenLabs Style */}
      <aside className="w-[260px] h-screen fixed top-0 left-0 bottom-0 hidden md:flex flex-col bg-[#F9FAFB] border-r border-gray-200/70 shrink-0 z-30 py-4 px-3">
        {/* Logo & Brand Header */}
        <div className="h-12 flex items-center px-2 shrink-0 mb-2">
          <Link href="/dashboard" className="text-xl font-display font-bold tracking-tight text-gray-900 flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <img src="/scouto_official_logo.png" alt="Scouto" className="w-7.5 h-7.5 rounded-full object-contain" />
            <span>Scouto</span>
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
                50 / 50 left
              </span>
            </div>

            <div className="w-full bg-gray-200/70 rounded-full h-1.5 overflow-hidden">
              <div className="bg-[#0A84FF] h-full rounded-full transition-all duration-300" style={{ width: '100%' }} />
            </div>

            <Link
              href="/pricing"
              className="w-full py-1 rounded-xl bg-gray-900 hover:bg-black text-white text-[11px] font-semibold flex items-center justify-center gap-1 transition-all shadow-2xs"
            >
              + Add Credits
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-2xs">
            <div className="flex items-center justify-between gap-2 group">
              <Link href="/settings" className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs">
                  S
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12.5px] font-semibold text-gray-900 truncate leading-tight group-hover:text-[#0A84FF] transition-colors">Settings &amp; Profile</span>
                  <span className="text-[10.5px] text-gray-400 truncate">Free Plan</span>
                </div>
              </Link>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Container - Offset by fixed sidebar width */}
      <div className="flex-1 md:pl-[260px] flex flex-col min-h-screen">
        {/* ElevenLabs Style Top Bar Header with Breadcrumbs */}
        <header className="h-[60px] flex items-center justify-between px-8 bg-white/80 backdrop-blur-md sticky top-0 z-20 shrink-0 border-b border-black/[0.06]">
          {/* Breadcrumb Context */}
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <span className="text-gray-400">Dashboard</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-gray-800 font-semibold">
              {pathname === '/dashboard' ? 'Overview' : pathname.replace('/', '').charAt(0).toUpperCase() + pathname.replace('/', '').slice(1)}
            </span>
          </div>

          {/* Search Bar & Auto-send / Notification Controls */}
          <div className="flex items-center gap-4">
            <div className="hidden md:flex relative w-72 group">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none group-focus-within:text-[#0A84FF] transition-colors" strokeWidth={2.2} />
              <input
                type="text"
                placeholder="Search..."
                className="w-full bg-gray-50/80 hover:bg-gray-100/60 focus:bg-white border border-gray-200/80 focus:border-[#0A84FF]/40 rounded-xl pl-8 pr-12 py-1.5 text-xs text-gray-900 placeholder-gray-400 font-medium focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/10 transition-all duration-200"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 bg-white border border-gray-200 rounded shadow-2xs pointer-events-none">
                ⌘K
              </kbd>
            </div>

            <div className="h-4 w-[1px] bg-gray-200 hidden md:block" />

            {/* Clean Auto-send toggle */}
            {autoSend !== null && (
              <button
                onClick={handleToggleAutoSend}
                disabled={togglingAutoSend}
                title={autoSend ? 'Auto-send is active — click to pause' : 'Auto-send is paused — click to resume'}
                className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-gray-50 hover:bg-gray-100/80 border border-gray-200/70 transition-all cursor-pointer"
              >
                <span className="text-xs font-medium text-gray-700 select-none">
                  Auto-send
                </span>
                <div className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${autoSend ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow-sm transition-transform duration-200 ${autoSend ? 'translate-x-[14px]' : 'translate-x-0'}`} />
                </div>
              </button>
            )}

            {/* Bell Icon */}
            <button className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200/70 flex items-center justify-center text-gray-600 transition-colors cursor-pointer" title="Notifications">
              <Bell className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 pb-[90px] md:pb-8 relative z-10 px-8 py-6 max-w-[1400px] w-full mx-auto">
          {children}
        </main>

        {/* Mobile Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-black/[0.06] pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-around px-2 h-[64px] pt-1">
            {NAV_ITEMS.filter(i => ['Dashboard', 'Opportunities', 'Drafts Ready', 'Keywords', 'Settings'].includes(i.name)).map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              const badge = badges[item.href]
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex flex-col items-center justify-center w-16 gap-1 transition-colors ${isActive ? 'text-[#0A84FF]' : 'text-gray-400 hover:text-gray-700'
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
          </div>
        </nav>
      </div>
    </div>
  )
}
