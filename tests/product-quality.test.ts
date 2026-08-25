import { describe, expect, it } from 'vitest'
import {
  buildAttributionDestinationUrl,
  buildAttributionShortUrl,
} from '../src/lib/attribution'
import {
  analyzeBuyingSignals,
  hasBuyingSignal,
} from '../src/lib/buying-signal-filter'
import {
  calculateAutomationDecision,
  evaluateAutoSendContentPolicy,
  evaluateAutoSendIntentPolicy,
} from '../src/lib/confidence-engine'
import {
  getIntentDisplayLabel,
  parseIntentResult,
} from '../src/lib/intent'
import { evaluateIntentPreflight } from '../src/lib/intent-preflight'
import { buildIntentScoringPrompt } from '../src/lib/intent-scorer'
import {
  buildFallbackSuggestions,
  sanitizeOnboardingSuggestions,
} from '../src/lib/onboarding-intelligence'
import {
  normalizeRedditUsername,
  normalizeWebsiteUrl,
  validateOnboardingData,
  validateProductContext,
  validateRedditUsername,
  validateWebsiteUrl,
} from '../src/lib/onboarding-validation'
import {
  countRequestedMonitoringRules,
  normalizeRedditTarget,
  redditTargetKey,
  validateRedditTarget,
} from '../src/lib/onboarding-capacity'
import { cleanDraftOutput, evaluateReplyQuality } from '../src/lib/reply-quality'

describe('buying-signal evidence', () => {
  it('returns the exact evidence and categories behind a commercial match', () => {
    expect(analyzeBuyingSignals(
      'I am looking for a replacement. The current pricing is too expensive.',
    )).toEqual({
      matchedSignals: ['looking for', 'too expensive', 'pricing'],
      categories: ['seeking', 'pain', 'purchase'],
    })
  })

  it('recognizes research and competitor replacement language', () => {
    const analysis = analyzeBuyingSignals('Any good alternative to Acme? Is it worth paying for?')
    expect(analysis.categories).toContain('research')
    expect(analysis.matchedSignals).toContain('alternative to')
    expect(analysis.matchedSignals).toContain('any good')
  })

  it('does not classify ordinary discussion as a buying signal', () => {
    expect(hasBuyingSignal('Here is a photo of the dashboard I made last weekend.')).toBe(false)
  })
})

describe('intent result validation', () => {
  it('normalizes a valid provider response', () => {
    expect(parseIntentResult({
      score: 88.4,
      label: 'buying',
      reasoning: 'The author is actively requesting a replacement product.',
      flag: 'COMPETITOR_RISK',
    })).toEqual({
      score: 88,
      label: 'buying',
      reasoning: 'The author is actively requesting a replacement product.',
      flag: 'COMPETITOR_RISK',
    })
  })

  it.each([
    null,
    { score: 101, label: 'buying', reasoning: 'Clearly invalid score.' },
    { score: 80, label: 'urgent', reasoning: 'Unknown label is rejected.' },
    { score: 80, label: 'buying', reasoning: 'short' },
  ])('rejects malformed model output', candidate => {
    expect(() => parseIntentResult(candidate)).toThrow()
  })

  it('rejects inconsistent score and label combinations', () => {
    expect(() => parseIntentResult({
      score: 35,
      label: 'buying',
      reasoning: 'The label conflicts with the configured scoring rubric.',
      flag: null,
    })).toThrow(/inconsistent/)
  })

  it('scores the title, body, and configured competitor watchlist', () => {
    const prompt = buildIntentScoringPrompt({
      platform: 'reddit',
      externalId: 'post-1',
      author: 'buyer',
      title: 'Looking for an alternative to Acme',
      text: 'Our current workflow keeps breaking.',
      url: 'https://reddit.example/post-1',
      createdAt: '2026-07-28T00:00:00.000Z',
      sourceTarget: 'SaaS',
    }, {
      business_name: 'BuyerWatch',
      business_description: 'Finds relevant buying conversations.',
      competitors: ['Acme'],
    }, {
      keywordTerm: 'lead generation',
    })

    expect(prompt).toContain('Title: Looking for an alternative to Acme')
    expect(prompt).toContain('Body: Our current workflow keeps breaking.')
    expect(prompt).toContain('Competitor watchlist: Acme')
    expect(prompt).toContain('Author: buyer')
    expect(prompt).toContain('Matched target: SaaS')
    expect(prompt).toContain('Matched keyword or rule: lead generation')
    expect(prompt).toContain('Published at: 2026-07-28T00:00:00.000Z')
    expect(prompt).toContain("Identify the author's role before scoring")
  })

  it('keeps display labels faithful to the model category', () => {
    expect(getIntentDisplayLabel('complaining', 72)).toBe('Pain signal')
    expect(getIntentDisplayLabel('other', 20)).toBe('Low relevance')
  })
})

describe('intent preflight cost gate', () => {
  const profile = {
    business_name: 'BuyerWatch',
    business_description: 'Monitor Reddit and Bluesky for high-intent lead generation conversations.',
    competitors: ['SignalCo'],
  }

  it('keeps self-promotional keyword matches out of paid AI scoring', () => {
    const result = evaluateIntentPreflight({
      platform: 'reddit',
      externalId: 'promo-1',
      author: 'maker',
      title: 'I built a lead generation dashboard',
      text: 'I launched it this week and would love feedback on my landing page.',
      url: 'https://reddit.example/promo-1',
      createdAt: '2026-08-04T00:00:00.000Z',
      sourceTarget: 'SaaS',
    }, profile, { keywordTerm: 'lead generation' })

    expect(result.shouldUseAi).toBe(false)
    expect(result.isQualifiedCandidate).toBe(false)
    expect(result.score).toBeLessThan(60)
    expect(result.noiseSignals).toEqual(expect.arrayContaining(['self_promotion', 'showcase']))
  })

  it('rejects launch feedback posts even when they contain a configured keyword', () => {
    const result = evaluateIntentPreflight({
      platform: 'reddit',
      externalId: 'promo-feedback-1',
      author: 'maker',
      title: 'Does anyone drink alcohol?',
      text: "I finally finished my lead generation app. I'm not looking for sign-ups; I'm looking for feedback. Give me your thoughts.",
      url: 'https://reddit.example/promo-feedback-1',
      createdAt: '2026-08-06T00:00:00.000Z',
      sourceTarget: 'SaaS',
    }, profile, { keywordTerm: 'lead generation' })

    expect(result.isQualifiedCandidate).toBe(false)
    expect(result.shouldUseAi).toBe(false)
    expect(result.score).toBeLessThan(40)
    expect(result.noiseSignals).toEqual(expect.arrayContaining(['self_promotion', 'showcase']))
  })

  it('does not treat generic buyer language as relevant without product context', () => {
    const result = evaluateIntentPreflight({
      platform: 'reddit',
      externalId: 'generic-request-1',
      author: 'maker',
      title: 'Looking for a developer',
      text: 'What tool should I use to coordinate a small case study?',
      url: 'https://reddit.example/generic-request-1',
      createdAt: '2026-08-06T00:00:00.000Z',
      sourceTarget: 'SaaS',
    }, profile, { keywordTerm: 'lead generation' })

    expect(result.isQualifiedCandidate).toBe(false)
    expect(result.shouldUseAi).toBe(false)
    expect(result.score).toBeLessThan(40)
  })

  it('passes explicit buying research to the paid scorer', () => {
    const result = evaluateIntentPreflight({
      platform: 'reddit',
      externalId: 'buyer-1',
      author: 'operator',
      title: 'Looking for lead generation software',
      text: 'What are people using for Reddit monitoring? I need pricing before choosing a tool.',
      url: 'https://reddit.example/buyer-1',
      createdAt: '2026-08-04T00:00:00.000Z',
      sourceTarget: 'SaaS',
    }, profile, { keywordTerm: 'lead generation' })

    expect(result.shouldUseAi).toBe(true)
    expect(result.isQualifiedCandidate).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.evidenceSignals).toEqual(expect.arrayContaining([
      'looking for',
      'pricing',
      'keyword:lead generation',
    ]))
  })

  it('keeps competitor replacement requests eligible even without a literal keyword hit', () => {
    const result = evaluateIntentPreflight({
      platform: 'reddit',
      externalId: 'competitor-1',
      author: 'buyer',
      title: 'Alternative to SignalCo?',
      text: 'The pricing is too expensive and I am looking for something better.',
      url: 'https://reddit.example/competitor-1',
      createdAt: '2026-08-04T00:00:00.000Z',
      sourceTarget: 'SaaS',
    }, profile, { keywordTerm: 'lead generation' })

    expect(result.shouldUseAi).toBe(true)
    expect(result.flag).toBe('COMPETITOR_RISK')
    expect(result.score).toBeGreaterThanOrEqual(80)
  })
})

describe('reply-quality policy', () => {
  it('allows a useful non-commercial reply without a disclosure', () => {
    const result = evaluateReplyQuality(
      'Start by checking whether the queue is backing up before replacing the database.',
      { businessName: 'BuyerWatch', platform: 'reddit' },
    )
    expect(result.blocksAutomation).toBe(false)
    expect(result.mentionedProduct).toBe(false)
  })

  it('requires disclosure when the product is mentioned', () => {
    const result = evaluateReplyQuality(
      'BuyerWatch can monitor those conversations and summarize the relevant ones.',
      { businessName: 'BuyerWatch', platform: 'reddit' },
    )
    expect(result.issues.map(issue => issue.code)).toContain('missing_disclosure')
  })

  it('allows a relevant, disclosed product mention', () => {
    const result = evaluateReplyQuality(
      "BuyerWatch can monitor those conversations. Disclosure: I'm affiliated with BuyerWatch.",
      { businessName: 'BuyerWatch', platform: 'reddit' },
    )
    expect(result.blocksAutomation).toBe(false)
    expect(result.hasDisclosure).toBe(true)
  })

  it('blocks promotional language and direct calls to action', () => {
    const result = evaluateReplyQuality(
      "You should try BuyerWatch, it is a game-changer. Sign up today! Disclosure: I'm affiliated with BuyerWatch.",
      { businessName: 'BuyerWatch', platform: 'reddit' },
    )
    expect(result.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining(['promotional_language', 'call_to_action']),
    )
  })

  it('blocks invented numerical outcomes', () => {
    const result = evaluateReplyQuality(
      'We increased conversions by 70% in one week.',
      { businessName: 'BuyerWatch', platform: 'reddit' },
    )
    expect(result.issues.map(issue => issue.code)).toContain('unsupported_claim')
  })

  it('enforces platform-specific reply limits', () => {
    const result = evaluateReplyQuality('a'.repeat(301), {
      businessName: 'BuyerWatch',
      platform: 'bluesky',
    })
    expect(result.issues.map(issue => issue.code)).toContain('too_long')
  })

  it.each([
    ['Reply: Start with the queue depth.', 'Start with the queue depth.'],
    ['"Start with the queue depth."', 'Start with the queue depth.'],
    ['```text\nStart with the queue depth.\n```', 'Start with the queue depth.'],
  ])('cleans provider framing from publishable output', (draft, expected) => {
    expect(cleanDraftOutput(draft)).toBe(expected)
  })

  it('blocks formulaic AI-style openings and assistant framing', () => {
    const formulaic = evaluateReplyQuality(
      'Great question! Start by checking the queue depth.',
      { businessName: 'BuyerWatch', platform: 'reddit' },
    )
    const meta = evaluateReplyQuality(
      'Here is a suggested reply: Start by checking the queue depth.',
      { businessName: 'BuyerWatch', platform: 'reddit' },
    )

    expect(formulaic.issues.map(issue => issue.code)).toContain('formulaic_opening')
    expect(meta.issues.map(issue => issue.code)).toContain('assistant_meta')
  })
})

describe('auto-send policy', () => {
  const safeDraft = {
    flagged: false,
    hasDisclosure: false,
    mentionedProduct: false,
    hasCommercialLink: false,
  }

  it('blocks free plans and disabled automation before trust evaluation', () => {
    expect(evaluateAutoSendContentPolicy(safeDraft, {
      plan: 'free',
      auto_send_enabled: true,
    })?.reason).toBe('auto_send_requires_paid_plan')
    expect(evaluateAutoSendContentPolicy(safeDraft, {
      plan: 'pro',
      auto_send_enabled: false,
    })?.reason).toBe('auto_send_disabled')
  })

  it('requires a verified score at or above the configured high-intent threshold', () => {
    expect(evaluateAutoSendIntentPolicy(Number.NaN, 80)?.reason).toBe('intent_score_unavailable')
    expect(evaluateAutoSendIntentPolicy(79, 80)?.reason).toBe('below_high_intent_threshold')
    expect(evaluateAutoSendIntentPolicy(80, 80)).toBeNull()
    expect(evaluateAutoSendIntentPolicy(94, 95)?.reason).toBe('below_high_intent_threshold')
  })

  it('blocks deterministic quality failures', () => {
    expect(evaluateAutoSendContentPolicy({
      ...safeDraft,
      flagged: true,
    }, {
      plan: 'pro',
      auto_send_enabled: true,
    })?.reason).toBe('reply_quality_blocked')
  })

  it('requires disclosure only for a commercial reference', () => {
    expect(evaluateAutoSendContentPolicy(safeDraft, {
      plan: 'pro',
      auto_send_enabled: true,
    })).toBeNull()
    expect(evaluateAutoSendContentPolicy({
      ...safeDraft,
      mentionedProduct: true,
    }, {
      plan: 'pro',
      auto_send_enabled: true,
    })?.reason).toBe('missing_disclosure')
  })

  it('never weakens the user-configured threshold', () => {
    const strict = calculateAutomationDecision({
      userTrust: 95,
      communityTrust: 95,
      learnedThreshold: 82,
      configuredThreshold: 97,
    })
    expect(strict.dynamicThreshold).toBe(97)
    expect(strict.approved).toBe(false)

    const learned = calculateAutomationDecision({
      userTrust: 90,
      communityTrust: 90,
      learnedThreshold: 90,
      configuredThreshold: 70,
    })
    expect(learned.dynamicThreshold).toBe(90)
    expect(learned.approved).toBe(true)
  })
})

describe('attribution URLs', () => {
  it('builds a first-party application redirect without leaking old query data', () => {
    expect(buildAttributionShortUrl(
      'https://app.example.com/base?debug=true',
      'abc_123',
    )).toBe('https://app.example.com/base/r/abc_123')
  })

  it('preserves customer query parameters and appends attribution safely', () => {
    expect(buildAttributionDestinationUrl(
      'https://customer.example/pricing?campaign=summer',
      'abc-123',
    )).toBe('https://customer.example/pricing?campaign=summer&ref=buyerwatch&sid=abc-123')
  })

  it('rejects unsafe tokens and destinations', () => {
    expect(() => buildAttributionShortUrl('https://app.example', '../admin')).toThrow()
    expect(() => buildAttributionDestinationUrl('javascript:alert(1)', 'abc123')).toThrow()
  })
})

describe('onboarding intelligence', () => {
  it('deduplicates and bounds untrusted provider suggestions', () => {
    const result = sanitizeOnboardingSuggestions({
      businessName: '  BuyerWatch  ',
      description: '  Finds relevant conversations. ',
      subreddits: ['r/SaaS', 'saas', 'not valid!', 'startups'],
      buyerKeywords: ['looking for a tool', 'Looking for a tool', '', 'recommend a tool'],
      competitorKeywords: [],
      painPointKeywords: [],
    }, 'ai')

    expect(result.businessName).toBe('BuyerWatch')
    expect(result.subreddits).toEqual(['SaaS', 'startups'])
    expect(result.buyerKeywords).toEqual(['looking for a tool', 'recommend a tool'])
  })

  it('uses honest generic intent patterns instead of treating the product as its own competitor', () => {
    const result = buildFallbackSuggestions({
      businessName: 'BuyerWatch',
      description: 'Software for monitoring online buying intent.',
      webpageTitle: '',
      webpageDescription: '',
    })
    expect(result.competitorKeywords).not.toContain('alternative to BuyerWatch')
    expect(result.buyerKeywords).toContain('looking for a tool')
  })
})

describe('onboarding validation', () => {
  it('requires enough product context for meaningful scoring', () => {
    expect(validateProductContext({
      businessName: 'BuyerWatch',
      businessDescription: 'short',
    })).toMatch(/short description/i)
  })

  it('accepts only public HTTP website URLs', () => {
    expect(validateWebsiteUrl('https://example.com/product')).toBeNull()
    expect(normalizeWebsiteUrl('example.com/product')).toBe('https://example.com/product')
    expect(validateWebsiteUrl('https://user:pass@example.com')).toMatch(/valid public/i)
    expect(validateWebsiteUrl('javascript:alert(1)')).toMatch(/valid public/i)
  })

  it('counts the actual phrase-by-community monitoring rules', () => {
    expect(countRequestedMonitoringRules([
      { term: 'looking for a tool', platforms: ['reddit'] },
      { term: 'alternative to', platforms: ['reddit'] },
    ], ['SaaS', 'startups'])).toBe(4)
  })

  it('normalizes and validates subreddit names without accepting URLs or spaces', () => {
    expect(normalizeRedditTarget(' r/SaaS ')).toBe('SaaS')
    expect(redditTargetKey('SaaS')).toBe(redditTargetKey('r/saas'))
    expect(validateRedditTarget('r/SaaS')).toBeNull()
    expect(validateRedditTarget('https://reddit.com/r/SaaS')).toMatch(/without spaces or a URL/i)
    expect(validateRedditTarget('small business')).toMatch(/without spaces or a URL/i)
  })

  it('normalizes Reddit usernames and rejects malformed values', () => {
    expect(normalizeRedditUsername(' u/Founder_Name ')).toBe('Founder_Name')
    expect(validateRedditUsername('u/Founder_Name')).toBeNull()
    expect(validateRedditUsername('bad username')).toMatch(/valid Reddit username/i)
  })

  it('validates the complete server payload without provider credentials', () => {
    expect(validateOnboardingData({
      business_name: 'BuyerWatch',
      business_description: 'Finds relevant buying conversations online.',
      business_url: 'https://buyerwatch.example',
      business_type: 'saas',
      writing_style: 'Direct and helpful.',
      reddit_username: '',
      keywords: [{ term: 'looking for a tool', platform: 'reddit', target: 'SaaS' }],
    })).toBeNull()
  })
})
