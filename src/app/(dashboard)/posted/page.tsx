'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquare,
} from 'lucide-react'
import { AppPage } from '@/components/AppPage'
import { useDashboardSession } from '@/components/DashboardContext'
import { BlueskyIcon, RedditIcon } from '@/components/Icons'
import { PageHeader } from '@/components/PageHeader'
import { staggers, springs } from '@/lib/motion'
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

function PlatformBadge({ platform }: { platform: string }) {
  const isReddit = platform.toLowerCase() === 'reddit'

  return (
    <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] bg-black/[0.025] px-2.5 py-1 text-[11px] font-semibold capitalize text-text-secondary">
      {isReddit ? (
        <RedditIcon className="h-3.5 w-3.5 text-[#FF4500]" />
      ) : (
        <BlueskyIcon className="h-3.5 w-3.5 text-[#1185FE]" />
      )}
      {platform}
    </span>
  )
}

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString)
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))

  if (elapsedSeconds < 60) return 'Just now'
  if (elapsedSeconds < 3600) {
    const minutes = Math.floor(elapsedSeconds / 60)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  }
  if (elapsedSeconds < 86400) {
    const hours = Math.floor(elapsedSeconds / 3600)
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }
  if (elapsedSeconds < 604800) {
    const days = Math.floor(elapsedSeconds / 86400)
    return `${days} ${days === 1 ? 'day' : 'days'} ago`
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

function formatSentDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatRedditTarget(value: string) {
  const normalized = value.replace(/^\/?r\//i, '').replace(/^\/+/, '')
  return normalized ? `r/${normalized}` : 'Reddit'
}

function formatAuthor(value: string, platform: string) {
  if (!value || value === 'unknown') return 'Unknown author'
  if (platform.toLowerCase() === 'reddit') {
    return value.startsWith('u/') ? value : `u/${value}`
  }
  return value.startsWith('@') ? value : `@${value}`
}

function PostedConversationCard({ item }: { item: PostedReply }) {
  return (
    <motion.article
      variants={staggers.item}
      transition={springs.smooth}
      className="group relative"
    >
      <div className="relative z-10 rounded-[20px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025),0_8px_24px_rgba(0,0,0,0.035)] transition-[border-color,box-shadow] duration-200 group-hover:border-black/[0.11] group-hover:shadow-[0_2px_4px_rgba(0,0,0,0.03),0_12px_34px_rgba(0,0,0,0.055)] sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <PlatformBadge platform={item.platform} />
            <span className="truncate text-[13px] font-semibold text-text-primary">
              {item.sourceLabel}
            </span>
            {item.authorLabel && (
              <>
                <span className="hidden text-black/20 sm:inline" aria-hidden>
                  ·
                </span>
                <span className="truncate text-[12px] font-medium text-text-tertiary">
                  {item.authorLabel}
                </span>
              </>
            )}
          </div>

          <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-[#EAF8F1] px-2.5 py-1 text-[11px] font-semibold text-[#087A52]">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            Posted
          </span>
        </div>

        <div className="mt-5 max-w-5xl">
          <h2 className="text-[16px] font-semibold leading-[1.45] tracking-[-0.015em] text-text-primary sm:text-[17px]">
            {item.title}
          </h2>
          {item.body && item.body !== item.title && (
            <p className="mt-2 line-clamp-3 text-[14px] leading-6 text-text-secondary">
              {item.body}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col justify-between gap-3 border-t border-black/[0.055] pt-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary">
              <Clock className="h-3.5 w-3.5" />
              {item.discoveredAt}
            </span>
            {item.matchedKeyword && (
              <span className="max-w-[240px] truncate rounded-md bg-[#EAF5FF] px-2 py-1 text-[11px] font-semibold text-[#0876B9]">
                {item.matchedKeyword}
              </span>
            )}
            <IntentBadge score={item.score} />
          </div>

          {item.threadUrl ? (
            <a
              href={item.threadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-full border border-black/[0.09] bg-white px-4 text-[12px] font-semibold text-text-primary transition-colors hover:bg-black/[0.035]"
            >
              View conversation
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} />
            </a>
          ) : (
            <span className="text-[12px] font-medium text-text-tertiary">
              Original link unavailable
            </span>
          )}
        </div>
      </div>

      <div className="relative z-0 -mt-px ml-4 rounded-b-[20px] rounded-tl-[18px] border border-black/[0.065] bg-[#F4F7F9] px-5 pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:ml-auto sm:w-[82%] sm:px-6">
        <div className="mb-2.5 flex flex-col justify-between gap-1.5 sm:flex-row sm:items-center">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#43505A]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#0A84FF] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.3} />
            </span>
            Your reply
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] font-medium text-text-tertiary">
            {item.clickedAt && <span className="rounded-full bg-white px-2 py-1 text-[#0876B9]">Clicked</span>}
            {item.convertedAt && <span className="rounded-full bg-[#EAF8F1] px-2 py-1 text-[#087A52]">Converted</span>}
            {item.revenueUsd > 0 && <span className="rounded-full bg-white px-2 py-1 text-text-primary">${item.revenueUsd.toFixed(2)}</span>}
            <span>Sent {item.sentAt}</span>
            {item.replyUrl && (
              <a
                href={item.replyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[#0876B9] hover:underline"
              >
                View reply <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#20282E] sm:text-[14.5px]">
          {item.reply}
        </p>
      </div>
    </motion.article>
  )
}

function PostedRepliesSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading posted replies" aria-busy="true">
      {[0, 1].map((item) => (
        <div key={item} className="animate-pulse">
          <div className="h-48 rounded-[20px] border border-black/[0.05] bg-white" />
          <div className="-mt-px ml-4 h-28 rounded-b-[20px] rounded-tl-[18px] bg-[#F4F7F9] sm:ml-auto sm:w-[82%]" />
        </div>
      ))}
    </div>
  )
}

function parsePostedThreads(data: any[]): PostedReply[] {
  return data.map((thread) => {
    const analytics = Array.isArray(thread.reply_analytics)
      ? thread.reply_analytics[0]
      : thread.reply_analytics
    const keyword = Array.isArray(thread.keywords)
      ? thread.keywords[0]
      : thread.keywords
    const platform = thread.platform || 'unknown'
    const author = thread.author || 'unknown'
    const title = thread.title?.trim() || thread.text_content?.trim() || 'Original conversation'
    const body = thread.title?.trim() ? thread.text_content?.trim() || '' : ''
    const sendAudits = Array.isArray(thread.send_audit_log)
      ? thread.send_audit_log
      : thread.send_audit_log ? [thread.send_audit_log] : []
    const successfulSend = sendAudits
      .filter((audit: any) => audit.status === 'success')
      .sort((left: any, right: any) => String(right.created_at).localeCompare(String(left.created_at)))[0]
    const attribution = Array.isArray(thread.reply_attribution)
      ? thread.reply_attribution[0]
      : thread.reply_attribution

    return {
      id: thread.id,
      platform,
      sourceLabel:
        platform.toLowerCase() === 'reddit'
          ? formatRedditTarget(keyword?.target || '')
          : formatAuthor(author, platform),
      authorLabel:
        platform.toLowerCase() === 'reddit' ? formatAuthor(author, platform) : '',
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

export default function PostedPage() {
  const [posted, setPosted] = useState<PostedReply[]>([])
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
          .select(
            'id, platform, author, title, text_content, url, intent_score, created_at, reply_analytics(draft_text, edited_text, sent_at), keywords(term, target), send_audit_log(status, permalink, created_at), reply_attribution(clicked_at, converted_at, revenue_usd)',
          )
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

      setPosted(parsePostedThreads(data ?? []))
      setTotalCount(countResult.count ?? data?.length ?? 0)
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
      setLoading(false)
    }

    void fetchPosted()

    return () => {
      cancelled = true
    }
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
      <div className="flex w-full flex-col">
        <PageHeader
          title="Posted Replies"
          subtitle="See each source conversation together with the reply you sent."
          action={
            !loading && totalCount > 0 ? (
              <span className="rounded-full border border-black/[0.07] bg-white px-3.5 py-2 text-[12px] font-semibold tabular-nums text-text-secondary">
                {totalCount} {totalCount === 1 ? 'reply' : 'replies'}
              </span>
            ) : undefined
          }
        />

        {loading ? (
          <PostedRepliesSkeleton />
        ) : loadFailed ? (
          <div className="surface-ceramic flex flex-col items-center justify-center border border-transparent py-24 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF3E8] text-[#D34519]">
              <MessageSquare className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <h2 className="mb-2 text-[18px] font-semibold text-text-primary">
              We couldn&apos;t load your replies
            </h2>
            <p className="max-w-sm text-[14px] leading-relaxed text-text-secondary">
              Refresh the page to try again. Your posted replies have not been changed.
            </p>
          </div>
        ) : posted.length === 0 ? (
          <div className="surface-ceramic flex flex-col items-center justify-center border border-transparent py-32 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF8F1] text-[#087A52]">
              <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} />
            </div>
            <h2 className="mb-2 text-[20px] font-display font-semibold text-text-primary">
              No replies posted yet
            </h2>
            <p className="max-w-sm text-[15px] leading-relaxed text-text-secondary">
              Once you approve or post a reply, the original conversation and your response will appear together here.
            </p>
          </div>
        ) : (
          <motion.div
            variants={staggers.container}
            initial="initial"
            animate="animate"
            className="space-y-6"
          >
            {posted.map((item) => (
              <PostedConversationCard key={item.id} item={item} />
            ))}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={loadMorePosted}
                  disabled={loadingMore}
                  className="rounded-full border border-black/[0.08] bg-white px-5 py-2.5 text-[13px] font-semibold text-text-primary shadow-sm transition-colors hover:bg-black/[0.025] disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more replies'}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </AppPage>
  )
}
