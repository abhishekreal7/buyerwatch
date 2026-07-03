'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Target, Edit3, CheckCircle, BarChart2, Key, Settings, Bell, Search, Menu } from 'lucide-react'
import { signOutAction } from '@/app/actions/auth'

const NAVIGATION = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Opportunities', href: '/opportunities', icon: Target, badge: 12 },
  { name: 'Drafts Ready', href: '/drafts', icon: Edit3, badge: 3 },
  { name: 'Posted', href: '/posted', icon: CheckCircle },
  { name: 'Analytics', href: '/analytics', icon: BarChart2 },
  { name: 'Keywords', href: '/keywords', icon: Key },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border hidden md:flex flex-col bg-surface/50 backdrop-blur-xl">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight text-text-primary flex items-center gap-2">
            <Target className="w-6 h-6 text-[#0A84FF]" />
            Scouto
          </Link>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {NAVIGATION.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                  isActive 
                    ? 'bg-black/5 text-text-primary font-medium' 
                    : 'text-text-secondary hover:bg-black/5 hover:text-text-primary'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </div>
                {item.badge && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isActive ? 'bg-[#0A84FF] text-text-primary' : 'bg-black/5 text-text-primary'}`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <form action={signOutAction}>
            <button type="submit" className="w-full text-left px-3 py-2.5 rounded-xl text-text-secondary hover:bg-black/5 hover:text-text-primary transition-colors text-sm">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <button className="md:hidden text-text-secondary hover:text-text-primary">
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden md:flex relative w-96 max-w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input 
                type="text" 
                placeholder="Search threads... (Cmd+K)" 
                className="w-full bg-surface-elevated border border-border rounded-xl pl-9 pr-4 py-2 text-sm text-text-primary placeholder-[#48484A] focus:outline-none focus:border-[#0A84FF]/50 transition-colors"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-text-secondary hover:text-text-primary transition-colors rounded-full hover:bg-black/5">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FF453A] rounded-full border border-[#111111]"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#0A84FF] to-purple-500 shadow-apple border border-border-hover"></div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto bg-[#000000]">
          {children}
        </div>
      </main>
    </div>
  )
}
