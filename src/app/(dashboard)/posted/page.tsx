'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageCircle,
  MessageSquare,
  TrendingUp,
} from 'lucide-react'
import { AppPage } from '@/components/AppPage'
import { useDashboardSession } from '@/components/DashboardContext'
import { BlueskyIcon, RedditIcon, XIcon } from '@/components/Icons'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/utils/supabase/client'
import { IntentBadge } from '@/components/IntentBadge'

const PAGE_SIZE = 40

interface PostedReply {
  id: string
  platform: string
  sourceLabel: string
  authorLabel: string
  matchedKeyword: string
  title: string
  body: string
  discoveredAt: string
  sentAt: string
  reply: string
  threadUrl: string | null
  replyUrl: string | null
  clickedAt: string | null
  convertedAt: string | null
  revenueUsd: number
  score: number
}

function PlatformIcon({ platform, size = 'sm' }: { platform: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5'
  const norm = platform.toLowerCase()
  if (norm === 'reddit') return <RedditIcon className={`${cls} text-[#FF4500]`} />
  if (norm === 'bluesky') return <BlueskyIcon className={`${cls} text-[#1185FE]`} />
  if (norm === 'x') return <XIcon className={`${cls} text-[#0F1419]`} />
  return <MessageCircle className={`${cls} text-gray-500`} />
}

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString)
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (elapsedSeconds < 60) return 'Just now'
  if (elapsedSeconds < 3600) { const m = Math.floor(elapsedSeconds / 60); return `${m}m ago` }
  if (elapsedSeconds < 86400) { const h = Math.floor(elapsedSeconds / 3600); return `${h}h ago` }
  if (elapsedSeconds < 604800) { const d = Math.floor(elapsedSeconds / 86400); return `${d}d ago` }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatSentDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatRedditTarget(value: string) {
  const normalized = value.replace(/^\/?r\//i, '').replace(/^\/+/, '')
  return normalized ? `r/${normalized}` : 'Reddit'
}

function formatAuthor(value: string, platform: string) {
  if (!value || value === 'unknown') return 'Unknown author'
  if (platform.toLowerCase() === 'reddit') return value.startsWith('u/') ? value : `u/${value}`
  return value.startsWith('@') ? value : `@${value}`
}

function parsePostedThreads(data: any[]): PostedReply[] {
  return data.map((thread) => {
    const analytics = Array.isArray(thread.reply_analytics) ? thread.reply_analytics[0] : thread.reply_analytics
    const keyword = Array.isArray(thread.keywords) ? thread.keywords[0] : thread.keywords
    const platform = thread.platform || 'unknown'
    const author = thread.author || 'unknown'
    const title = thread.title?.trim() || thread.text_content?.trim() || 'Original conversation'
    const body = thread.title?.trim() ? thread.text_content?.trim() || '' : ''
    const sendAudits = Array.isArray(thread.send_audit_log)
      ? thread.send_audit_log
      : thread.send_audit_log ? [thread.send_audit_log] : []
    const successfulSend = sendAudits
      .filter((audit: any) => audit.status === 'success')
      .sort((l: any, r: any) => String(r.created_at).localeCompare(String(l.created_at)))[0]
    const attribution = Array.isArray(thread.reply_attribution)
      ? thread.reply_attribution[0]
      : thread.reply_attribution

    return {
      id: thread.id,
      platform,
      sourceLabel: platform.toLowerCase() === 'reddit' ? formatRedditTarget(keyword?.target || '') : formatAuthor(author, platform),
      authorLabel: platform.toLowerCase() === 'reddit' ? formatAuthor(author, platform) : '',
      matchedKeyword: keyword?.term || '',
      title,
      body,
      discoveredAt: formatRelativeDate(thread.created_at),
      sentAt: formatSentDate(analytics?.sent_at || thread.created_at),
      reply: analytics?.edited_text || analytics?.draft_text || 'Reply logged.',
      threadUrl: thread.url || null,
      replyUrl: successfulSend?.permalink || null,
      clickedAt: attribution?.clicked_at || null,
      convertedAt: attribution?.converted_at || null,
      revenueUsd: Number(attribution?.revenue_usd) || 0,
      score: Math.round(Number(thread.intent_score) || 0),
    }
  })
}

// ─── Left Panel: Compact Posted Row ──────────────────────────────────────────

function PostedRow({
  item,
  isActive,
  onClick,
}: {
  item: PostedReply
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-[#F0F0ED] transition-colors duration-100 group ${
        isActive
          ? 'bg-[#F0FAF5] border-l-2 border-l-emerald-500'
          : 'bg-white border-l-2 border-l-transparent hover:bg-[#FAFAF8]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className={`text-[13.5px] font-semibold leading-snug line-clamp-1 transition-colors ${
          isActive ? 'text-[#1C1C1A]' : 'text-[#1C1C1A] group-hover:text-emerald-700'
        }`}>
          {item.title}
        </h4>
        {/* Posted badge */}
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#EAF8F1] px-2 py-0.5 text-[10.5px] font-semibold text-[#087A52]">
          <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
          Posted
        </span>
      </div>

      <p className="text-[12px] text-[#6B6B66] line-clamp-2 leading-relaxed mb-2">
        {item.body || item.reply}
      </p>

      <div className="flex items-center gap-2 text-[11px] text-[#8C8C85] flex-wrap">
        <PlatformIcon platform={item.platform} />
        <span className="font-medium text-[#4A4A45] truncate max-w-[90px]">{item.sourceLabel}</span>
        <span className="opacity-40">·</span>
        <span>{item.discoveredAt}</span>
        {item.convertedAt && (
          <>
            <span className="opacity-40">·</span>
            <span className="text-emerald-600 font-semibold">Converted</span>
          </>
        )}
        {item.clickedAt && !item.convertedAt && (
          <>
            <span className="opacity-40">·</span>
            <span className="text-[#0876B9] font-semibold">Clicked</span>
          </>
        )}
      </div>
    </button>
  )
}

// ─── Right Panel: Thread + Reply View ────────────────────────────────────────

function DetailPanel({ item }: { item: PostedReply }) {
  const hasConversion = Boolean(item.convertedAt)
  const hasClick = Boolean(item.clickedAt)

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-[#EDEDEA] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <PlatformIcon platform={item.platform} size="md" />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-[#1C1C1A]">{item.sourceLabel}</h3>
            {item.authorLabel && (
              <span className="block text-[11px] font-medium text-[#8C8C85]">{item.authorLabel}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.matchedKeyword && (
            <span className="rounded-md bg-[#EAF5FF] px-2 py-1 text-[11px] font-semibold text-[#0876B9]">
              {item.matchedKeyword}
            </span>
          )}
          <IntentBadge score={item.score} />
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Attribution stats row */}
        {(hasConversion || hasClick || item.revenueUsd > 0) && (
          <div className="flex items-center gap-3 rounded-xl bg-[#F0FAF5] border border-emerald-100 px-4 py-3">
            <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
            <div className="flex items-center gap-3 text-[12.5px] font-semibold flex-wrap">
              {hasConversion && <span className="text-emerald-700">Converted</span>}
              {hasClick && !hasConversion && <span className="text-[#0876B9]">Link clicked</span>}
              {item.revenueUsd > 0 && (
                <span className="text-[#1C1C1A]">${item.revenueUsd.toFixed(2)} attributed</span>
              )}
            </div>
          </div>
        )}

        {/* Original thread */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8C8C85] mb-2">Original thread</p>
          <div className="rounded-[16px] border border-[#E8E8E5] bg-[#F7F7F5] px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2 text-[11px] font-medium text-[#8C8C85]">
              <PlatformIcon platform={item.platform} />
              <span>{item.sourceLabel}</span>
              <span className="opacity-40">·</span>
              <Clock className="h-3 w-3" />
              <span>{item.discoveredAt}</span>
            </div>
            {item.title && (
              <h4 className="text-[14.5px] font-semibold text-[#1C1C1A] leading-snug mb-1.5">{item.title}</h4>
            )}
            {item.body && item.body !== item.title && (
              <p className="text-[13px] leading-relaxed text-[#4A4A45]">{item.body}</p>
            )}
            {item.threadUrl && (
              <a
                href={item.threadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0A84FF] hover:underline"
              >
                View on {item.platform} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Your reply */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8C8C85]">Your reply</p>
            <span className="text-[11px] text-[#8C8C85]">Sent {item.sentAt}</span>
          </div>
          <div className="rounded-[16px] border border-emerald-200 bg-[#F2FCF7] px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
                <MessageSquare className="h-3 w-3 text-emerald-600" strokeWidth={2.3} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#3A6B50]">BuyerWatch reply</span>
            </div>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#1C1C1A]">{item.reply}</p>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="shrink-0 border-t border-[#EDEDEA] bg-white px-6 py-4 flex items-center gap-3">
        {item.threadUrl && (
          <a
            href={item.threadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-[#DEDEDA] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#4A4A45] hover:bg-[#F7F7F4] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View conversation
          </a>
        )}
        {item.replyUrl && (
          <a
            href={item.replyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-[#F0FAF5] px-3.5 py-2 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            View live reply
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Empty Right Panel ────────────────────────────────────────────────────────

function EmptyDetail({ loading }: { loading?: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F2F2EF]">
        <CheckCircle2 className="h-7 w-7 text-[#8C8C85]" strokeWidth={1.75} />
      </div>
      <p className="text-[14px] font-semibold text-[#4A4A45] mb-1">
        {loading ? 'Loading replies…' : 'No replies posted yet'}
      </p>
      <p className="text-[13px] text-[#8C8C85] max-w-[260px] leading-relaxed">
        {loading ? '' : 'Once you approve or auto-send a reply, the full conversation thread will appear here.'}
      </p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PostedPage() {
  const [posted, setPosted] = useState<PostedReply[]>([])
  const [selected, setSelected] = useState<PostedReply | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()

  useEffect(() => {
    let cancelled = false

    async function fetchPosted() {
      setLoading(true)
      setLoadFailed(false)

      const [pageResult, countResult] = await Promise.all([
        supabase
          .from('monitored_threads')
          .select('id, platform, author, title, text_content, url, intent_score, created_at, reply_analytics(draft_text, edited_text, sent_at), keywords(term, target), send_audit_log(status, permalink, created_at), reply_attribution(clicked_at, converted_at, revenue_usd)')
          .eq('user_id', userId)
          .eq('status', 'replied')
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1),
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'replied'),
      ])
      const { data, error } = pageResult

      if (cancelled) return

      if (error) {
        setLoadFailed(true)
        setLoading(false)
        return
      }

      const parsed = parsePostedThreads(data ?? [])
      setPosted(parsed)
      if (parsed.length > 0) setSelected(parsed[0])
      setTotalCount(countResult.count ?? data?.length ?? 0)
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
      setLoading(false)
    }

    void fetchPosted()
    return () => { cancelled = true }
  }, [supabase, userId])

  async function loadMorePosted() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const from = posted.length
    const { data, error } = await supabase
      .from('monitored_threads')
      .select('id, platform, author, title, text_content, url, intent_score, created_at, reply_analytics(draft_text, edited_text, sent_at), keywords(term, target), send_audit_log(status, permalink, created_at), reply_attribution(clicked_at, converted_at, revenue_usd)')
      .eq('user_id', userId)
      .eq('status', 'replied')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      setLoadFailed(true)
    } else {
      setPosted(current => [...current, ...parsePostedThreads(data ?? [])])
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
    }
    setLoadingMore(false)
  }

  return (
    <AppPage>
      <div className="flex w-full flex-col" style={{ height: 'calc(100vh - 56px)' }}>

        {/* Header */}
        <PageHeader
          title="Posted Replies"
          action={
            !loading && totalCount > 0 ? (
              <span className="rounded-full border border-black/[0.07] bg-white px-3.5 py-2 text-[12px] font-semibold tabular-nums text-[#4A4A45]">
                {totalCount} {totalCount === 1 ? 'reply' : 'replies'}
              </span>
            ) : undefined
          }
        />

        {loadFailed ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-24">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF3E8] text-[#D34519]">
              <MessageSquare className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <h2 className="mb-2 text-[18px] font-semibold text-[#1C1C1A]">Couldn&apos;t load replies</h2>
            <p className="max-w-sm text-[14px] leading-relaxed text-[#6B6B66]">
              Refresh the page to try again.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* LEFT: Compact Posted List */}
            <div className="flex flex-col border-r border-[#E7E7E3] overflow-hidden" style={{ width: '380px', minWidth: '380px', flexShrink: 0 }}>
              <div className="shrink-0 px-4 py-3 border-b border-[#EDEDEA]">
                <p className="text-[13px] font-medium text-[#6B6B66]">
                  <span className="tabular-nums font-bold text-[#1C1C1A]">{totalCount}</span> posted {totalCount === 1 ? 'reply' : 'replies'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {loading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="h-[88px] animate-pulse bg-[#F5F5F3] border-b border-[#F0F0ED] mx-3 my-2 rounded-lg" />
                  ))
                ) : posted.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-[13px] text-[#8C8C85]">
                    No posted replies yet
                  </div>
                ) : (
                  posted.map(item => (
                    <PostedRow
                      key={item.id}
                      item={item}
                      isActive={selected?.id === item.id}
                      onClick={() => setSelected(item)}
                    />
                  ))
                )}

                {!loading && hasMore && (
                  <div className="flex justify-center py-4">
                    <button
                      type="button"
                      onClick={loadMorePosted}
                      disabled={loadingMore}
                      className="rounded-full border border-black/[0.08] bg-white px-5 py-2 text-[12px] font-semibold text-[#1C1C1A] hover:bg-black/[0.025] disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Thread + Reply Detail */}
            <div className="flex-1 overflow-hidden bg-white">
              {selected ? (
                <DetailPanel item={selected} />
              ) : (
                <EmptyDetail loading={loading} />
              )}
            </div>
          </div>
        )}
      </div>
    </AppPage>
  )
}
