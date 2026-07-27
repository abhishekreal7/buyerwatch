'use client'

import React, { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import {
  FolderClosed,
  LayoutDashboard,
  Package,
  Search,
  Settings,
} from 'lucide-react'
import {
  ReferenceAnalyticsIcon,
  ReferencePostedIcon,
  ReferencePuzzleIcon,
} from '@/components/SidebarReferenceIcons'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const openPalette = () => setOpen(true)
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
    window.addEventListener('buyerwatch:open-command-palette', openPalette)
    return () => {
      document.removeEventListener('keydown', down)
      window.removeEventListener('buyerwatch:open-command-palette', openPalette)
    }
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
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/35 p-4 pt-[12vh] backdrop-blur-sm sm:pt-[18vh]"
    >
      <div className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
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
              onSelect={() => runCommand(() => router.push('/drafts'))}
              className="flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-text-primary rounded-xl aria-selected:bg-black/5 aria-selected:text-accent cursor-pointer transition-colors"
            >
              <FolderClosed className="w-4 h-4 text-text-secondary" />
              <span>Drafts</span>
            </Command.Item>
            <Command.Item 
              onSelect={() => runCommand(() => router.push('/analytics'))}
              className="flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-text-primary rounded-xl aria-selected:bg-black/5 aria-selected:text-accent cursor-pointer transition-colors"
            >
              <ReferenceAnalyticsIcon className="h-4 w-4 text-text-secondary" />
              <span>Analytics</span>
            </Command.Item>
            <Command.Item
              onSelect={() => runCommand(() => router.push('/keywords'))}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-text-primary transition-colors aria-selected:bg-black/5 aria-selected:text-accent"
            >
              <ReferencePuzzleIcon className="h-4 w-4 text-text-secondary" />
              <span>Keywords</span>
            </Command.Item>
            <Command.Item
              onSelect={() => runCommand(() => router.push('/opportunities'))}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-text-primary transition-colors aria-selected:bg-black/5 aria-selected:text-accent"
            >
              <Package className="h-4 w-4 text-text-secondary" />
              <span>Opportunities</span>
            </Command.Item>
            <Command.Item
              onSelect={() => runCommand(() => router.push('/posted'))}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-text-primary transition-colors aria-selected:bg-black/5 aria-selected:text-accent"
            >
              <ReferencePostedIcon className="h-4 w-4 text-text-secondary" />
              <span>Posted replies</span>
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Quick Actions" className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider px-2 py-2 mt-2">
            <Command.Item 
              onSelect={() => runCommand(() => router.push('/opportunities'))}
              className="flex items-center gap-3 px-3 py-2.5 mt-1 text-[14px] font-medium text-text-primary rounded-xl aria-selected:bg-black/5 aria-selected:text-accent cursor-pointer transition-colors"
            >
              <Package className="w-4 h-4 text-text-secondary" />
              <span>Review opportunities</span>
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
