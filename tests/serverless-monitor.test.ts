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
    createdAt: '2026-08-01T12:00:00.000Z',
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

  it('keeps buying-signal posts even without a literal keyword match', () => {
    const result = buildRedditScoreCandidates([
      post({ title: 'Looking for a recommendation', text: 'What tool should I use?' }),
    ], [
      { id: 'keyword-1', user_id: 'user-1', term: 'lead generation' },
    ])

    expect(result.candidates).toHaveLength(1)
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
})

describe('QStash monitoring route contract', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/cron/enqueue/route.ts'),
    'utf8',
  )
  const setup = readFileSync(
    join(process.cwd(), 'scripts/setup-qstash-schedule.mjs'),
    'utf8',
  )
  const monitor = readFileSync(
    join(process.cwd(), 'src/lib/serverless-monitor.ts'),
    'utf8',
  )
  const scoreJob = readFileSync(
    join(process.cwd(), 'src/app/api/jobs/score/route.ts'),
    'utf8',
  )
  const reddit = readFileSync(
    join(process.cwd(), 'src/lib/reddit.ts'),
    'utf8',
  )
  const fetchNow = readFileSync(
    join(process.cwd(), 'src/app/api/keywords/fetch-now/route.ts'),
    'utf8',
  )

  it('verifies signed QStash requests and runs direct monitoring', () => {
    expect(route).toContain('verifyQStashRequest')
    expect(route).toContain('runServerlessMonitoring')
    expect(route).not.toContain('enqueueDueMonitoring')
  })

  it('creates an economical five-minute schedule with retries', () => {
    expect(setup).toContain("cron: '*/5 * * * *'")
    expect(setup).toContain('retries: 2')
    expect(setup).toContain("scheduleId: 'buyerwatch-reddit-monitor'")
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
    expect(monitor).toContain('markKeywordsPolled(completedWork, now)')
  })

  it('keeps the paid Reddit proxy strictly opt-in', () => {
    expect(reddit).toContain("REDDITAPIS_FALLBACK_ENABLED === 'true'")
    expect(reddit).toContain('paidFallbackEnabled\n    && redditApisKey')
  })

  it('dispatches manual fetches for the exact selected social target', () => {
    expect(fetchNow).toContain('publishMonitoringRun(user.id, target, keyword.platform)')
    expect(fetchNow).toContain("keyword.platform !== 'reddit' && keyword.platform !== 'bluesky'")
  })

  it('runs extension scoring through a signed, retryable job endpoint', () => {
    expect(scoreJob).toContain('verifyQStashRequest')
    expect(scoreJob).toContain('processScorePost')
    expect(scoreJob).toContain(".from('ingestion_events')")
    expect(scoreJob).toContain('processed_at: new Date().toISOString()')
  })
})
