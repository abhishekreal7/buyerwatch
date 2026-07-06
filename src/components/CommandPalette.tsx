'use client'

import React, { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { Search, Settings, Home, Target, Edit3, MessageCircle, FileText, LayoutDashboard } from 'lucide-react'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = (command: () => void) => {
    setOpen(false)
    command()
  }

  return (
    <Command.Dialog 
      open={open} 
      onOpenChange={setOpen} 
      label="Global Command Menu"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] bg-black/40 backdrop-blur-sm transition-all p-4"
    >
      <div className="w-full max-w-[640px] bg-surface rounded-2xl shadow-2xl border border-black/5 overflow-hidden flex flex-col scale-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center px-4 border-b border-black/5" cmdk-input-wrapper="">
          <Search className="w-5 h-5 text-text-tertiary shrink-0" />
          <Command.Input 
            autoFocus 
            placeholder="Search commands or jump to..." 
            className="w-full bg-transparent border-0 h-14 px-4 text-[15px] outline-none text-text-primary placeholder-text-tertiary"
          />
        </div>
        
        <Command.List className="max-h-[300px] overflow-y-auto p-2 overscroll-contain">
          <Command.Empty className="py-6 text-center text-sm text-text-secondary">
            No results found.
          </Command.Empty>

          <Command.Group heading="Navigation" className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider px-2 py-2">
            <Command.Item 
              onSelect={() => runCommand(() => router.push('/dashboard'))}
              className="flex items-center gap-3 px-3 py-2.5 mt-1 text-[14px] font-medium text-text-primary rounded-xl aria-selected:bg-black/5 aria-selected:text-accent cursor-pointer transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-text-secondary group-aria-selected:text-accent" />
              <span>Dashboard</span>
            </Command.Item>
            <Command.Item 
              onSelect={() => runCommand(() => router.push('/opportunities'))}
              className="flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-text-primary rounded-xl aria-selected:bg-black/5 aria-selected:text-accent cursor-pointer transition-colors"
            >
              <Target className="w-4 h-4 text-text-secondary" />
              <span>Opportunities</span>
            </Command.Item>
            <Command.Item 
              onSelect={() => runCommand(() => router.push('/drafts'))}
              className="flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-text-primary rounded-xl aria-selected:bg-black/5 aria-selected:text-accent cursor-pointer transition-colors"
            >
              <FileText className="w-4 h-4 text-text-secondary" />
              <span>Drafts</span>
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Quick Actions" className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider px-2 py-2 mt-2">
            <Command.Item 
              onSelect={() => runCommand(() => router.push('/opportunities'))}
              className="flex items-center gap-3 px-3 py-2.5 mt-1 text-[14px] font-medium text-text-primary rounded-xl aria-selected:bg-black/5 aria-selected:text-accent cursor-pointer transition-colors"
            >
              <Edit3 className="w-4 h-4 text-text-secondary" />
              <span>Compose New Reply...</span>
            </Command.Item>
            <Command.Item 
              onSelect={() => runCommand(() => router.push('/settings'))}
              className="flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-text-primary rounded-xl aria-selected:bg-black/5 aria-selected:text-accent cursor-pointer transition-colors"
            >
              <Settings className="w-4 h-4 text-text-secondary" />
              <span>Settings & Preferences</span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  )
}
