import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  classifySubredditCommunityPolicy,
  evaluateRedditReplyPolicy,
  extractSubredditFromRedditUrl,
  normalizeSubreddit,
} from '../src/lib/reddit-community-policy'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

function policyFromRules(
  description: string,
  options: { sidebar?: string; stickyTitle?: string; incompleteSources?: boolean } = {},
) {
  return classifySubredditCommunityPolicy({
    subreddit: 'saas',
    rules: {
      rules: [{ name: 'Promotion policy', description }],
    },
    about: {
      description: options.sidebar ?? 'Practical conversations for SaaS builders.',
      subreddit_type: 'public',
    },
    hot: {
      posts: options.stickyTitle
        ? [{ stickied: true, title: options.stickyTitle, permalink: '/r/SaaS/comments/promo/weekly/' }]
        : [],
    },
    incompleteSources: options.incompleteSources ?? false,
  })
}

describe('Reddit community policy', () => {
  it('normalizes only valid subreddit names and extracts them from Reddit URLs', () => {
    expect(normalizeSubreddit('r/SaaS')).toBe('saas')
    expect(normalizeSubreddit('not valid!')).toBeNull()
    expect(extractSubredditFromRedditUrl('https://www.reddit.com/r/SaaS/comments/abc/example/')).toBe('saas')
    expect(extractSubredditFromRedditUrl('https://example.com/r/SaaS/comments/abc')).toBeNull()
  })

  it('blocks a commercial reply when community rules prohibit self-promotion', () => {
    const policy = policyFromRules('No self-promotion, advertising, or solicitation.')
    const decision = evaluateRedditReplyPolicy(policy, {
      text: "Soluto can help with that. Disclosure: I'm affiliated with Soluto.",
      businessName: 'Soluto',
      businessUrl: 'https://soluto.in',
    })

    expect(policy.status).toBe('promotion_prohibited')
    expect(decision).toMatchObject({
      outcome: 'blocked',
      reason: 'reddit_policy_promotion_prohibited',
      commercialReference: true,
    })
  })

  it('routes promotion-thread-only communities away from ordinary replies', () => {
    const policy = policyFromRules(
      'No self-promotion except in the weekly promotion thread.',
      { stickyTitle: 'Weekly Self Promotion Thread' },
    )
    const decision = evaluateRedditReplyPolicy(policy, {
      text: "I work with Soluto. Disclosure: I'm affiliated with Soluto.",
      businessName: 'Soluto',
      businessUrl: 'https://soluto.in',
    })

    expect(policy.status).toBe('promotion_thread_only')
    expect(policy.promotionThread?.url).toBe('https://www.reddit.com/r/SaaS/comments/promo/weekly/')
    expect(decision.outcome).toBe('blocked')
    expect(decision.reason).toBe('reddit_policy_promotion_thread_only')
  })

  it('allows an explicit opt-in rule but enforces a no-link restriction', () => {
    const policy = policyFromRules('Self-promotion is allowed, but external links are not allowed.')
    const linkFree = evaluateRedditReplyPolicy(policy, {
      text: "Soluto may be relevant here. Disclosure: I'm affiliated with Soluto.",
      businessName: 'Soluto',
      businessUrl: 'https://soluto.in',
    })
    const withLink = evaluateRedditReplyPolicy(policy, {
      text: "Soluto may be relevant here: https://soluto.in. Disclosure: I'm affiliated with Soluto.",
      businessName: 'Soluto',
      businessUrl: 'https://soluto.in',
    })

    expect(policy.status).toBe('allowed_without_links')
    expect(linkFree.outcome).toBe('auto_send_allowed')
    expect(withLink).toMatchObject({
      outcome: 'blocked',
      reason: 'reddit_policy_no_external_links',
    })
  })

  it('fails closed when the rules do not explicitly permit commercial replies', () => {
    const policy = policyFromRules('Keep discussions constructive and on topic.')
    const decision = evaluateRedditReplyPolicy(policy, {
      text: "Soluto may be relevant here. Disclosure: I'm affiliated with Soluto.",
      businessName: 'Soluto',
      businessUrl: 'https://soluto.in',
    })

    expect(policy.status).toBe('manual_review')
    expect(decision).toMatchObject({
      outcome: 'manual_review_required',
      reason: 'reddit_policy_manual_review',
    })
  })

  it('fails closed when sidebar or sticky-thread inspection is incomplete', () => {
    const policy = policyFromRules('Self-promotion is allowed.', { incompleteSources: true })

    expect(policy).toMatchObject({
      status: 'manual_review',
      reasonCode: 'policy_sources_incomplete',
    })
  })

  it('enforces the community gate while scoring and immediately before direct delivery', () => {
    const scoreWorker = read('worker/handlers/score-post.ts')
    const sender = read('src/lib/send-reply.ts')
    const manualRoute = read('src/app/api/replies/send/route.ts')
    const providerClient = read('src/lib/redditapis-client.ts')
    const communityPolicy = read('src/lib/reddit-community-policy.ts')

    expect(scoreWorker).toContain('getSubredditCommunityPolicy(')
    expect(scoreWorker).toContain('extractSubredditFromRedditUrl(post.url)')
    expect(sender).toContain('forceRefresh: true')
    expect(sender).toContain('Skipped auto-send after Reddit community policy check')
    expect(manualRoute).toContain('requiresManualRedditSubmit')
    expect(providerClient).toContain('Authorization')
    expect(communityPolicy).toContain('/api/reddit/sub/${encodeURIComponent(subreddit)}/rules')
  })
})
