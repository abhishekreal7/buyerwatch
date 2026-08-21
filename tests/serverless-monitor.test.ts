import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRedditScoreCandidates } from '../src/lib/reddit-candidates'
import type { NormalizedPost } from '../src/lib/types'

function post(overrides: Partial<NormalizedPost> = {}): NormalizedPost {
  return {
    platform: 'reddit',
    externalId: 'post-1',
    author: 'founder',
    title: 'How do I find customers?',
    text: 'I need a practical way to find customers for my product.',
    url: 'https://reddit.com/r/Entrepreneur/comments/post-1',
    createdAt: new Date().toISOString(),
    sourceTarget: 'entrepreneur',
    ...overrides,
  }
}

describe('serverless social candidate selection', () => {
  it('scores an explicit keyword match once per user', () => {
    const result = buildRedditScoreCandidates([post()], [
      { id: 'keyword-1', user_id: 'user-1', term: 'find customers' },
      { id: 'keyword-2', user_id: 'user-1', term: 'customers' },
    ])

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      userId: 'user-1',
      keywordId: 'keyword-1',
    })
  })

  it('rejects generic buyer language without a literal keyword or competitor match', () => {
    const result = buildRedditScoreCandidates([
      post({ title: 'Looking for a recommendation', text: 'What tool should I use?' }),
    ], [
      { id: 'keyword-1', user_id: 'user-1', term: 'lead generation' },
    ])

    expect(result.candidates).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('keeps explicit competitor replacement research in scope', () => {
    const result = buildRedditScoreCandidates([
      post({ title: 'Looking for a SignalCo alternative', text: 'What tool should I use?' }),
    ], [
      {
        id: 'keyword-1',
        user_id: 'user-1',
        term: 'lead generation',
        competitors: ['SignalCo'],
      },
    ])

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({ keywordId: 'keyword-1' })
  })

  it('rejects noise before any paid model call', () => {
    const result = buildRedditScoreCandidates([
      post({ title: 'Weekly progress update', text: 'Here is what I built this week.' }),
    ], [
      { id: 'keyword-1', user_id: 'user-1', term: 'lead generation' },
    ])

    expect(result.candidates).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('does not discard a genuine buyer just because their background includes offering services', () => {
    const result = buildRedditScoreCandidates([
      post({
        title: 'Our agency needs lead generation monitoring software',
        text: 'We help B2B clients, but we need a Reddit monitoring tool for our own team and are comparing pricing this week.',
      }),
    ], [
      { id: 'keyword-1', user_id: 'user-1', term: 'lead generation' },
    ])

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({ keywordId: 'keyword-1' })
  })

  it('rejects stale source posts before scoring or persistence', () => {
    const result = buildRedditScoreCandidates([
      post({ createdAt: new Date(Date.now() - 72 * 60 * 60_000).toISOString() }),
    ], [
      { id: 'keyword-1', user_id: 'user-1', term: 'find customers' },
    ])

    expect(result.candidates).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('uses controlled keyword aliases without removing the buying-signal gate', () => {
    const result = buildRedditScoreCandidates([
      post({
        title: 'How can I get customers for my B2B product?',
        text: 'We need a tool before Friday and are comparing options.',
      }),
    ], [
      { id: 'keyword-1', user_id: 'user-1', term: 'lead generation' },
    ])

    expect(result.candidates).toHaveLength(1)
  })
})

describe('QStash monitoring route contract', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/cron/enqueue/route.ts'),
    'utf8',
  )
  const failureRoute = readFileSync(
    join(process.cwd(), 'src/app/api/cron/failure/route.ts'),
    'utf8',
  )
  const setup = readFileSync(
    join(process.cwd(), 'scripts/setup-qstash-schedule.mjs'),
    'utf8',
  ).replace(/\r\n/g, '\n')
  const monitor = readFileSync(
    join(process.cwd(), 'src/lib/serverless-monitor.ts'),
    'utf8',
  ).replace(/\r\n/g, '\n')
  const scoreJob = readFileSync(
    join(process.cwd(), 'src/app/api/jobs/score/route.ts'),
    'utf8',
  ).replace(/\r\n/g, '\n')
  const workerScorer = readFileSync(
    join(process.cwd(), 'worker/handlers/score-post.ts'),
    'utf8',
  ).replace(/\r\n/g, '\n')
  const reddit = readFileSync(
    join(process.cwd(), 'src/lib/reddit.ts'),
    'utf8',
  ).replace(/\r\n/g, '\n')
  const fetchNow = readFileSync(
    join(process.cwd(), 'src/app/api/keywords/fetch-now/route.ts'),
    'utf8',
  ).replace(/\r\n/g, '\n')
  const sourceTimeMigration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260808010000_preserve_source_post_time.sql'),
    'utf8',
  ).replace(/\r\n/g, '\n')

  it('verifies signed QStash requests and runs direct monitoring', () => {
    expect(route).toContain('verifyQStashRequest')
    expect(route).toContain('readTextBody(request, 4_096)')
    expect(route).toContain('runServerlessMonitoring')
    expect(route).not.toContain('enqueueDueMonitoring')
  })

  it('creates an economical five-minute schedule with retries', () => {
    expect(setup).toContain("cron: '*/5 * * * *'")
    expect(setup).toContain('retries: 2')
    expect(setup).toContain("scheduleId: 'buyerwatch-reddit-monitor'")
    expect(setup).toContain('failureCallback,')
    expect(setup).toContain('schedule.failureCallback !== failureCallback')
  })

  it('authenticates, deduplicates, and alerts after scheduler retries are exhausted', () => {
    expect(failureRoute).toContain('verifyQStashRequest')
    expect(failureRoute).toContain('readTextBody(request, MAX_CALLBACK_BYTES)')
    expect(failureRoute).toContain("'NX'")
    expect(failureRoute).toContain('new Resend(apiKey).emails.send')
    expect(failureRoute).not.toContain('sourceBody')
  })

  it('recovers durable checkpoints before fetching newly discovered candidates', () => {
    expect(monitor).toContain('loadPendingSocialCheckpoints')
    expect(monitor).toContain('persistPendingCandidates(discoveredCandidates)')
    expect(monitor).toContain(".eq('status', 'pending')")
    expect(monitor).toContain('for (const candidate of [...checkpoints, ...discoveredCandidates])')
  })

  it('bounds provider work and gates serverless auto-send by platform support', () => {
    expect(monitor).toContain('SERVERLESS_MONITOR_MAX_SCORES')
    expect(monitor).toContain("candidate.post.platform === 'bluesky'")
    expect(monitor).toContain('isRedditDirectPostingConfigured()')
    expect(monitor).toContain('allowAutoSend,')
    expect(monitor).toContain('dispatchPendingOutbox(10)')
    expect(monitor).toContain('enqueueFollowUpJobs: false')
    expect(monitor).toContain('providerRetries: 0')
  })

  it('bounds and rotates oversized social target batches', () => {
    expect(monitor).toContain('SERVERLESS_MONITOR_MAX_TARGETS')
    expect(monitor).toContain("redis.incr('cursor:serverless-social-target')")
    expect(monitor).toContain('work = Array.from({ length: maxTargets }')
  })

  it('monitors Bluesky through the same durable serverless path', () => {
    expect(monitor).toContain(".in('platform', ['reddit', 'bluesky'])")
    expect(monitor).toContain('searchBlueskyPosts(target.target, 25)')
    expect(monitor).toContain('platform: post.platform')
    expect(monitor).toContain('recordKeywordPollSuccess')
    expect(monitor).toContain('recordKeywordPollFailure')
  })

  it('keeps managed Reddit discovery strictly opt-in and provider-first', () => {
    expect(reddit).toContain('hasRedditDiscoveryProvider')
    expect(reddit).toContain('RedditAPIs primary discovery')
    expect(reddit.indexOf('RedditAPIs primary discovery')).toBeLessThan(
      reddit.indexOf('FALLBACK: Reddit public RSS feed'),
    )
  })

  it('dispatches manual fetches for the exact selected social target', () => {
    expect(fetchNow).toContain('publishMonitoringRun(user.id, target, keyword.platform)')
    expect(fetchNow).toContain("keyword.platform !== 'reddit' && keyword.platform !== 'bluesky'")
  })

  it('runs scoring through a signed, retryable job endpoint', () => {
    expect(scoreJob).toContain('verifyQStashRequest')
    expect(scoreJob).toContain('processScorePost')
    expect(scoreJob).toContain(".from('ingestion_events')")
    expect(scoreJob).toContain('processed_at: new Date().toISOString()')
  })

  it('preserves source publication time across persistence and checkpoint recovery', () => {
    expect(sourceTimeMigration).toContain('add column if not exists source_created_at timestamptz')
    expect(sourceTimeMigration).toContain('create or replace function public.persist_scored_thread_v2')
    expect(workerScorer).toContain("supabase.rpc('persist_scored_thread_v2'")
    expect(workerScorer).toContain('p_source_created_at: post.createdAt')
    expect(monitor).toContain('source_created_at, created_at')
    expect(monitor).toContain('source_created_at: post.createdAt')
    expect(monitor).toContain('createdAt: row.source_created_at || row.created_at')
  })
})
