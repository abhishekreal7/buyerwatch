'use client'

import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { usePathname, useRouter } from 'next/navigation'
import { MessageCircle, Search } from 'lucide-react'
import { BlueskyIcon, RedditIcon } from '@/components/Icons'
import { useDashboardSession } from '@/components/DashboardContext'
import { createClient } from '@/utils/supabase/client'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'

type ConversationSearchResult = {
  id: string
  platform: string
  author: string
  target: string
  keyword: string
  title: string
  content: string
  score: number
  status: string
  createdAt: string
}

type SearchThreadRow = {
  id: string
  platform: string | null
  author: string | null
  title: string | null
  text_content: string | null
  intent_score: number | string | null
  status: string | null
  created_at: string
  keywords: unknown
}

function readKeyword(value: unknown): { term?: string; target?: string } {
  if (Array.isArray(value)) return (value[0] ?? {}) as { term?: string; target?: string }
  return (value ?? {}) as { term?: string; target?: string }
}

function formatTimeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversations, setConversations] = useState<ConversationSearchResult[]>([])
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const openSearch = () => setOpen(true)
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen(current => !current)
      }
    }

    document.addEventListener('keydown', handleShortcut)
    window.addEventListener('buyerwatch:open-conversation-search', openSearch)
    return () => {
      document.removeEventListener('keydown', handleShortcut)
      window.removeEventListener('buyerwatch:open-conversation-search', openSearch)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function loadConversations() {
      setLoading(true)
      clearSupabaseReadCache()
      const { data, error } = await supabase
        .from('monitored_threads')
        .select('id, platform, author, title, text_content, intent_score, status, created_at, keywords(term, target)')
        .eq('user_id', userId)
        .in('status', ['pending', 'drafted', 'needs_manual_reply', 'dismissed'])
        .order('created_at', { ascending: false })
        .limit(120)

      if (cancelled) return
      if (error) {
        setConversations([])
        setLoading(false)
        return
      }

      const rows = (data ?? []) as unknown as SearchThreadRow[]
      setConversations(rows.map(row => {
        const keyword = readKeyword(row.keywords)
        return {
          id: row.id,
          platform: row.platform || 'unknown',
          author: row.author || 'Unknown author',
          target: keyword.target || row.platform || 'Unknown source',
          keyword: keyword.term || '',
          title: row.title || 'Untitled conversation',
          content: row.text_content || '',
          score: Number(row.intent_score) || 0,
          status: row.status || 'pending',
          createdAt: row.created_at,
        }
      }))
      setLoading(false)
    }

    void loadConversations()
    return () => {
      cancelled = true
    }
  }, [open, supabase, userId])

  function closeSearch() {
    setOpen(false)
    setQuery('')
  }

  function openConversation(threadId: string) {
    closeSearch()
    const destination = `/dashboard?thread=${encodeURIComponent(threadId)}`
    if (pathname === '/dashboard') {
      window.history.replaceState(null, '', destination)
      window.dispatchEvent(new CustomEvent('buyerwatch:open-thread', { detail: threadId }))
      return
    }
    router.push(destination)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={value => {
        setOpen(value)
        if (!value) setQuery('')
      }}
      label="Search dashboard conversations"
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/25 p-4 pt-[10vh] backdrop-blur-[2px] sm:pt-[14vh]"
    >
      <div className="flex w-full max-w-[620px] flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.20)]">
        <div className="flex h-[54px] items-center gap-3 border-b border-black/[0.07] px-4" cmdk-input-wrapper="">
          <Search className="h-[18px] w-[18px] shrink-0 text-text-tertiary" strokeWidth={2} />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search conversations by title, text, author, or keyword"
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-text-primary outline-none placeholder:text-text-tertiary focus:outline-none focus:ring-0"
            style={{ outline: 'none', boxShadow: 'none' }}
          />
          <kbd className="hidden rounded-md border border-black/[0.08] bg-[#F5F5F2] px-2 py-1 text-[10px] font-semibold text-text-tertiary sm:inline-flex">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[min(430px,68vh)] overflow-y-auto px-2 py-2.5 overscroll-contain">
          {loading && (
            <div className="px-4 py-10 text-center text-[13px] text-text-secondary">
              Loading conversations...
            </div>
          )}

          {!loading && (
            <>
              <Command.Empty className="px-5 py-12 text-center">
                <p className="text-[13px] font-semibold text-text-primary">No conversations found</p>
                <p className="mt-1 text-[12px] text-text-tertiary">Try a title, subreddit, author, or monitored keyword.</p>
              </Command.Empty>

              <Command.Group
                heading={query ? 'Matching conversations' : 'Recent conversations'}
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-text-tertiary"
              >
                {conversations.map(conversation => (
                  <Command.Item
                    key={conversation.id}
                    value={`${conversation.title} ${conversation.content} ${conversation.author} ${conversation.target} ${conversation.keyword} ${conversation.platform}`}
                    onSelect={() => openConversation(conversation.id)}
                    className="group flex cursor-pointer items-start gap-3 rounded-[11px] px-3 py-3 text-text-primary transition-colors aria-selected:bg-[#F0F0ED]"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-black/[0.035] text-text-secondary">
                      {conversation.platform === 'reddit' ? (
                        <RedditIcon className="h-4 w-4 text-[#FF4500]" />
                      ) : conversation.platform === 'bluesky' ? (
                        <BlueskyIcon className="h-4 w-4 text-[#1185FE]" />
                      ) : (
                        <MessageCircle className="h-4 w-4" strokeWidth={1.9} />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold leading-5">
                        {conversation.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] leading-4 text-text-secondary">
                        {conversation.platform === 'reddit' ? `r/${conversation.target}` : conversation.target}
                        <span className="mx-1.5 text-black/25">/</span>
                        {conversation.author}
                        <span className="mx-1.5 text-black/25">/</span>
                        {formatTimeAgo(conversation.createdAt)}
                      </span>
                    </span>

                    <span className="mt-1 shrink-0 rounded-full bg-black/[0.045] px-2 py-1 text-[10.5px] font-semibold tabular-nums text-text-secondary">
                      {conversation.score}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            </>
          )}
        </Command.List>

        <div className="hidden items-center justify-between border-t border-black/[0.06] bg-[#FAFAF8] px-4 py-2 text-[10px] font-medium text-text-tertiary sm:flex">
          <span>{conversations.length} searchable conversations</span>
          <span className="flex items-center gap-4">
            <span><kbd className="mr-1 font-semibold">Up / Down</kbd> Navigate</span>
            <span><kbd className="mr-1 font-semibold">Enter</kbd> Open</span>
          </span>
        </div>
      </div>
    </Command.Dialog>
  )
}
