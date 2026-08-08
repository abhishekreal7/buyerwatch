import { describe, expect, it } from 'vitest'
import { evaluateIntentPreflight } from '../src/lib/intent-preflight'
import { scoreWithoutProvider } from '../src/lib/intent-scorer'
import type { IntentLabel } from '../src/lib/intent'
import type { NormalizedPost } from '../src/lib/types'

type ExpectedBand = IntentLabel

type AuditCase = {
  id: string
  category: string
  title: string
  text: string
  createdAt?: string
  sourceTarget?: string
  keywordTerm?: string
  profile?: {
    business_name?: string
    business_description?: string
    competitors?: string[]
  }
  expectedBand: ExpectedBand
  humanReason: string
}

const profile = {
  business_name: 'BuyerWatch',
  business_description: 'Social listening software that monitors Reddit and Bluesky for buyer intent, lead generation opportunities, and contextual reply drafting.',
  competitors: ['GummySearch', 'F5Bot'],
}

const FRESH_POST_TIMESTAMP = new Date(Date.now() - 86_400_000).toISOString()

const cases: AuditCase[] = [
  {
    id: 'clear-buyer',
    category: 'Clear genuine pain with buying intent',
    title: 'Need a Reddit lead generation tool this week',
    text: 'We are looking for software that monitors Reddit for buyer-intent conversations. GummySearch is on our shortlist, but I need pricing under $150 per month and a recommendation before Friday.',
    expectedBand: 'buying',
    humanReason: 'The author has a relevant need, shortlist, budget, and decision deadline.',
  },
  {
    id: 'founder-promotion',
    category: 'Founder promoting own product',
    title: 'I just launched my lead generation dashboard',
    text: 'We finally built it and are looking for feedback on our launch. Check out my product and give me your thoughts; I am not looking for another tool.',
    expectedBand: 'other',
    humanReason: 'The author is selling and requesting feedback, not buying.',
  },
  {
    id: 'offering-help',
    category: 'Offering help rather than seeking it',
    title: 'I help SaaS founders with lead generation',
    text: 'I offer a free teardown to anyone struggling with pipeline. Send me your site and I will explain how our agency can help.',
    expectedBand: 'other',
    humanReason: 'The author is offering a service to others.',
  },
  {
    id: 'vague-discussion',
    category: 'Vague general discussion',
    title: 'Is lead generation changing?',
    text: 'Curious what everyone thinks about lead generation in 2026. There are many opinions and no single right answer.',
    expectedBand: 'other',
    humanReason: 'This is an open-ended discussion with no personal need or evaluation.',
  },
  {
    id: 'stale-buyer',
    category: 'Old post with keyword and former urgency',
    title: 'Need lead generation software by Friday',
    text: 'I am looking for a Reddit monitoring tool and need pricing before we choose one this week.',
    createdAt: '2024-01-10T10:00:00.000Z',
    expectedBand: 'other',
    humanReason: 'The request was actionable when posted but is more than two years stale.',
  },
  {
    id: 'sarcasm',
    category: 'Sarcastic mention',
    title: 'Exactly what the world needs',
    text: 'Yeah, because what I really need is another lead generation tool spamming me with "qualified" Reddit leads. Please invent five more.',
    expectedBand: 'other',
    humanReason: 'The author is mocking the category, not seeking it.',
  },
  {
    id: 'different-category',
    category: 'Genuine question in a different category',
    title: 'Looking for payroll software',
    text: 'What software handles contractor tax forms in India? Our company happens to sell lead generation services, but this request is only about payroll compliance.',
    expectedBand: 'other',
    humanReason: 'The genuine need is payroll, unrelated to BuyerWatch.',
  },
  {
    id: 'stacked-pain',
    category: 'Multiple genuine pain points',
    title: 'Replacing our manual Reddit lead generation workflow',
    text: 'We are sick of checking six subreddits manually, missing buying posts, and replying after competitors. I am looking for a monitoring tool, need team alerts, and want pricing for three seats this week.',
    expectedBand: 'buying',
    humanReason: 'The author has several relevant pains plus an active purchase evaluation.',
  },
  {
    id: 'implied-pain',
    category: 'Implied pain without explicit buyer phrase',
    title: 'Competitors keep reaching Reddit prospects first',
    text: 'Every morning I scan six subreddits by hand. By the time I find a relevant thread, two competitors have already replied and the prospect has chosen a direction.',
    keywordTerm: 'reddit monitoring',
    expectedBand: 'complaining',
    humanReason: 'The workflow pain is clear even though the author never says "I need a tool."',
  },
  {
    id: 'hiring',
    category: 'Hiring rather than buying software',
    title: 'Hiring a lead generation specialist',
    text: 'We are looking for a senior contractor to run outbound campaigns. This is a job opening with a salary range, not a software evaluation.',
    expectedBand: 'other',
    humanReason: 'The author is recruiting a person.',
  },
  {
    id: 'seller-agency',
    category: 'Seller seeking customers',
    title: 'Lead generation agency taking two new clients',
    text: 'I run a lead generation agency and we are looking to take on two more SaaS clients this month. We handle Reddit outreach for founders.',
    expectedBand: 'other',
    humanReason: 'The author is seeking customers for their own offer.',
  },
  {
    id: 'explicit-negation',
    category: 'Explicit negation',
    title: 'We do not need lead generation software',
    text: 'Our inbound pipeline is full, so we absolutely do not need a lead generation tool. What software do you use for ordering team lunches?',
    expectedBand: 'other',
    humanReason: 'The relevant need is explicitly denied; the actual question is unrelated.',
  },
  {
    id: 'academic-question',
    category: 'Academic hypothetical question',
    title: 'Lead generation software survey for university',
    text: 'For a university paper, what software do SaaS teams use for lead generation? I am collecting examples only and am not evaluating or buying anything.',
    expectedBand: 'other',
    humanReason: 'The author is researching academically, not as a potential buyer.',
  },
  {
    id: 'competitor-replacement',
    category: 'Active competitor replacement',
    title: 'GummySearch alternative with better team alerts?',
    text: 'We are leaving GummySearch because alerts arrive too late. Is there a tool with Slack alerts, Reddit monitoring, and pricing below $200 per month?',
    expectedBand: 'buying',
    humanReason: 'The author is actively replacing a named competitor with requirements and budget.',
  },
  {
    id: 'feedback-showcase',
    category: 'Showcase requesting feedback',
    title: 'I built a Reddit lead generation app',
    text: 'I just shipped the MVP. I am looking for feedback, not sign-ups or recommendations. Roast my landing page.',
    expectedBand: 'other',
    humanReason: 'The author is showcasing their own product.',
  },
  {
    id: 'advice-not-tool',
    category: 'Relevant advice request without purchase intent',
    title: 'How do I get my first ten SaaS customers?',
    text: 'I am bootstrapped and trying to learn lead generation without spending money yet. What is the best way to start conversations manually?',
    expectedBand: 'researching',
    humanReason: 'The problem is relevant and real, but the author explicitly is not purchasing yet.',
  },
  {
    id: 'content-promotion',
    category: 'Content promotion framed as a request',
    title: 'My complete lead generation playbook',
    text: 'I wrote a newsletter issue covering every Reddit tactic we use. If you are looking for lead generation ideas, subscribe to read the full guide.',
    expectedBand: 'other',
    humanReason: 'The author is promoting content and soliciting subscribers.',
  },
  {
    id: 'builder-technical-help',
    category: 'r/SaaS builder seeking unrelated technical help',
    title: 'Need help fixing onboarding in my lead generation app',
    text: 'My lead generation SaaS is already launched. I need help debugging a React hydration error in the onboarding form. What tool should I use to inspect it?',
    sourceTarget: 'SaaS',
    expectedBand: 'other',
    humanReason: 'The author is a builder asking for engineering help, not a buyer for BuyerWatch.',
  },
  {
    id: 'agency-operator-buying',
    category: 'Service provider who is also a genuine buyer',
    title: 'Our agency needs Reddit monitoring software before next month',
    text: 'We help B2B clients with demand generation, but this is not a client pitch. We need software that monitors Reddit for buying signals across five client accounts, and I am comparing pricing this week.',
    expectedBand: 'buying',
    humanReason: 'Running an agency does not make the author a seller in this post; they state a relevant need and active evaluation.',
  },
  {
    id: 'seller-looking-for-buyers',
    category: 'Seller solicitation phrased as looking for',
    title: 'Looking for companies that need lead generation',
    text: 'I run an outbound agency and am looking for companies that need lead generation help. We have two client slots open, so send me a DM if you want more Reddit leads.',
    expectedBand: 'other',
    humanReason: 'The author is looking for buyers for their agency, not looking to buy BuyerWatch.',
  },
  {
    id: 'contrast-negation-buyer',
    category: 'Negation followed by an affirmed relevant need',
    title: 'We do not need another CRM, but we do need Reddit monitoring',
    text: 'We do not need another CRM. What we do need is lead generation monitoring software with Reddit alerts, and I have a $120 monthly budget to choose one this week.',
    expectedBand: 'buying',
    humanReason: 'The negated category is CRM; the author positively states a separate, directly relevant purchase need.',
  },
  {
    id: 'university-procurement',
    category: 'Academic organization making a real purchase',
    title: 'University lab needs social monitoring software',
    text: 'Our university lab has approved grant budget for a Reddit and Bluesky monitoring tool. We are comparing annual pricing and need to select a vendor by Friday.',
    expectedBand: 'buying',
    humanReason: 'The institution is academic, but this post has budget, requirements, and a current vendor decision.',
  },
  {
    id: 'founder-buying-complementary-tool',
    category: 'Founder with own product buying a complementary tool',
    title: 'Built our CRM; now we need Reddit lead monitoring',
    text: 'We built our own CRM last year, so I am not promoting it here. I am now looking for Reddit monitoring software to find buyer-intent posts and need team pricing before Monday.',
    expectedBand: 'buying',
    humanReason: 'Mentioning an owned product is background; the author is explicitly shopping for a different, relevant product.',
  },
  {
    id: 'procurement-rfp',
    category: 'Formal procurement phrased without a canned recommendation request',
    title: 'Lead generation monitoring RFP closes Friday',
    text: 'Procurement approved a $2,000 annual budget. We are evaluating vendors for Reddit social listening and will select one Monday.',
    expectedBand: 'buying',
    humanReason: 'The author has approved budget, is evaluating vendors, and names an imminent selection date.',
  },
  {
    id: 'natural-seeking',
    category: 'Natural-language solution request',
    title: 'Need to replace manual lead generation monitoring',
    text: 'Can somebody point me to a platform for tracking buyer conversations on Reddit? The current spreadsheet no longer scales.',
    expectedBand: 'buying',
    humanReason: 'The author asks for a directly relevant platform to replace an inadequate manual workflow.',
  },
  {
    id: 'beta-promotion',
    category: 'Beta recruitment disguised by seeking language',
    title: 'Need beta testers for our lead generation app',
    text: 'We are opening early access next week and looking for founders to try our Reddit prospecting product.',
    expectedBand: 'other',
    humanReason: 'The author is recruiting testers for their own product, not seeking a solution.',
  },
  {
    id: 'can-help-seller',
    category: 'Service offer phrased as help',
    title: 'I can help with lead generation',
    text: 'I can help SaaS founders find Reddit leads. Book a call for our managed service.',
    expectedBand: 'other',
    humanReason: 'The author is pitching a managed service and asking readers to book a call.',
  },
  {
    id: 'quoted-newsletter',
    category: 'Quoted buyer language inside editorial content',
    title: 'A customer said they need Reddit monitoring',
    text: 'A customer told me "we need a Reddit lead generation tool this week." I am sharing the quote in my newsletter about demand generation.',
    expectedBand: 'other',
    humanReason: 'The buying words belong to a quoted customer; the author is publishing content rather than shopping.',
  },
  {
    id: 'client-research',
    category: 'Consultant collecting market research',
    title: 'What lead generation tools do your clients use?',
    text: 'I advise founders and am collecting examples of what my clients use for Reddit lead generation. This is for a benchmark report.',
    expectedBand: 'other',
    humanReason: 'The author is compiling a report, not evaluating a solution for their own operation.',
  },
  {
    id: 'team-manual',
    category: 'Relevant team pain without procurement details',
    title: 'How are teams tracking Reddit buyer conversations?',
    text: 'What does everyone use for Reddit lead alerts? Our team currently checks five communities manually and keeps missing relevant posts.',
    expectedBand: 'researching',
    humanReason: 'The author has first-party pain and is exploring tools, but gives no immediate decision signal.',
  },
  {
    id: 'not-my-need',
    category: 'Relevant need attributed only to customers',
    title: 'My customers need lead generation, not me',
    text: 'I do not need a Reddit monitoring tool. I am hiring someone because my customers need lead generation support.',
    expectedBand: 'other',
    humanReason: 'The author explicitly denies the need and is recruiting a person for customer work.',
  },
  {
    id: 'educational-non-request',
    category: 'Educational content with explicit non-request',
    title: 'No recommendations please: our Reddit workflow',
    text: 'Here is how I monitor Reddit manually. This is a tutorial for my newsletter, not a request for software recommendations.',
    expectedBand: 'other',
    humanReason: 'The author is teaching a workflow and explicitly says they are not seeking recommendations.',
  },
  {
    id: 'need-users-launch',
    category: 'Launch recruitment containing need language',
    title: 'Need users for my Reddit lead generation tool',
    text: 'I built a social listening app and need ten founders to use it this month. Join the waitlist for early access.',
    expectedBand: 'other',
    humanReason: 'The author needs users for their own product rather than a product for their business.',
  },
  {
    id: 'implicit-seeking',
    category: 'Implied solution search from missed-opportunity pain',
    title: 'Missing Reddit alternative requests',
    text: 'Is there a way to get notified when people ask for alternatives on Reddit? I keep finding the threads after competitors have replied.',
    expectedBand: 'researching',
    humanReason: 'The author is exploring a directly relevant capability but has not expressed an active purchase decision.',
  },
  {
    id: 'hypothetical-budget',
    category: 'Hypothetical purchase question with explicit denial',
    title: 'If you had unlimited budget, which lead tool?',
    text: 'Just curious for a thought experiment: if you had unlimited budget, what lead generation software would you buy? I am not shopping for anything.',
    expectedBand: 'other',
    humanReason: 'The scenario is hypothetical and the author expressly says they are not shopping.',
  },
  {
    id: 'newsletter-operator-buying',
    category: 'Content publisher with an independent purchase need',
    title: 'Our newsletter team needs Reddit monitoring software',
    text: 'I publish a B2B newsletter, and our team needs a Reddit monitoring platform for lead alerts. We have approved a $120 monthly budget and will select a vendor Friday.',
    expectedBand: 'buying',
    humanReason: 'Publishing a newsletter is incidental; the author independently states a relevant need, budget, and vendor decision.',
  },
  {
    id: 'editorial-pricing-news',
    category: 'Editorial link with commercial vocabulary',
    title: 'AI compute pricing could reshape startups',
    text: 'AI compute could cost ten times more as demand outpaces supply. What happens if Anthropic becomes a trillion-dollar business? A deep look at pricing power and startup implications. https://example.com/analysis',
    keywordTerm: 'startup',
    expectedBand: 'other',
    humanReason: 'This is third-party editorial commentary with no first-party need or purchase decision.',
  },
  {
    id: 'prescriptive-sales-advice',
    category: 'Prescriptive sales advice',
    title: 'Fix the story before adding sales channels',
    text: 'Most B2B SaaS founders blame channels when growth stalls. More channels just amplify unclear messaging and a weak sales story.',
    keywordTerm: 'sales',
    expectedBand: 'other',
    humanReason: 'The author is publishing advice, not requesting help for their own operation.',
  },
  {
    id: 'generic-keyword-unrelated-buyer',
    category: 'Real buyer in an unrelated solution category',
    title: 'Labor is taking 37% of sales',
    text: 'Our labor costs are wrecking margins. We are looking for restaurant management software that connects POS data with shift forecasts.',
    keywordTerm: 'sales',
    expectedBand: 'other',
    humanReason: 'The buyer need is restaurant operations; sales appears only as a generic financial metric.',
  },
  {
    id: 'saas-for-sale-listing',
    category: 'Founder listing their SaaS for sale',
    title: 'Looking to sell for my SaaS with $1.8k revenue in 3.5 months',
    text: 'Three months old with a 92% margin and low maintenance. Send me a message if you want the asking price.',
    keywordTerm: 'sales',
    expectedBand: 'other',
    humanReason: 'The author is selling an asset, not buying lead-generation help.',
  },
  {
    id: 'design-partner-recruitment',
    category: 'Design-partner recruitment',
    title: 'Looking for sales-led SaaS founders',
    text: 'I built a proactive website chat product and am looking for five design partners. I will run it free for 30 days in return for feedback.',
    keywordTerm: 'sales',
    expectedBand: 'other',
    humanReason: 'The author is recruiting pilot users for their own product.',
  },
  {
    id: 'generic-sales-keyword-real-buyer',
    category: 'Generic keyword in a real first-party request',
    title: 'Need sales prospecting software for our team',
    text: 'Our team needs a sales prospecting platform with Reddit alerts. We have approved a $150 monthly budget and will select a vendor Friday.',
    keywordTerm: 'sales',
    expectedBand: 'buying',
    humanReason: 'Sales is directly tied to the requested platform, with first-party need, budget, and timing.',
  },
  {
    id: 'affiliate-advertorial',
    category: 'Affiliate advertisement',
    title: 'The best tech deal this week',
    text: 'Most people never realize what technology can do. Buy this gadget through my paid Amazon affiliate link. #ad #paidlink #tech',
    keywordTerm: 'tech',
    expectedBand: 'other',
    humanReason: 'This is an affiliate promotion, not a first-party technology request.',
  },
  {
    id: 'long-form-business-essay',
    category: 'Long-form founder essay',
    title: 'My thoughts on incorporating AI into your business',
    text: 'I have a computer science background. Here are principles for deciding whether AI pricing and sales automation make sense. You should fix your process before automating it. Open to opinions and pushback.',
    keywordTerm: 'sales',
    expectedBand: 'other',
    humanReason: 'The author is teaching and inviting discussion, not seeking a solution for their own company.',
  },
  {
    id: 'placeholder-profile-token',
    category: 'Placeholder workspace name contamination',
    title: 'Web test recorders with reliable playback',
    text: 'I am looking for a Chrome extension for UI testing. The ones I tried break when buttons move. Does anyone know a testing tool that understands the DOM?',
    keywordTerm: 'lead generation',
    profile: {
      business_name: 'Scouto Test',
      business_description: 'We build a premium lead generation platform.',
      competitors: [],
    },
    expectedBand: 'other',
    humanReason: 'The placeholder word “test” in the workspace name must not make unrelated QA tooling relevant.',
  },
  {
    id: 'partnership-solicitation',
    category: 'Partnership solicitation',
    title: 'AI compliance partnership',
    text: 'I am looking to partner with lead vendors and outbound agencies to build a new compliance standard. I would like to connect with companies that want to collaborate.',
    expectedBand: 'other',
    humanReason: 'The author is recruiting partners for their own initiative, not seeking a product to buy.',
  },
  {
    id: 'retrospective-cold-email-guide',
    category: 'Retrospective operational guide',
    title: 'We over-engineered cold email for a year before it actually worked',
    text: 'We run outbound and had too many broken inboxes. Here is the setup we eventually settled on and the lessons we learned for anyone following the same path.',
    keywordTerm: 'cold email',
    expectedBand: 'other',
    humanReason: 'This is a retrospective guide with a resolved workflow, not an active request.',
  },
]

function bandForScore(score: number): ExpectedBand {
  if (score >= 80) return 'buying'
  if (score >= 60) return 'researching'
  if (score >= 40) return 'complaining'
  return 'other'
}

function postFromCase(testCase: AuditCase): NormalizedPost {
  return {
    platform: 'reddit',
    externalId: testCase.id,
    author: `audit-${testCase.id}`,
    title: testCase.title,
    text: testCase.text,
    url: `https://reddit.example/r/${testCase.sourceTarget ?? 'SaaS'}/${testCase.id}`,
    createdAt: testCase.createdAt ?? FRESH_POST_TIMESTAMP,
    sourceTarget: testCase.sourceTarget ?? 'SaaS',
  }
}

describe('intent sophistication audit battery', () => {
  it.each(cases)('$id — $category', (testCase) => {
    const post = postFromCase(testCase)
    const caseProfile = { ...profile, ...testCase.profile }
    const result = evaluateIntentPreflight(post, caseProfile, {
      keywordTerm: testCase.keywordTerm ?? 'lead generation',
    })
    const productionFallback = scoreWithoutProvider(post, caseProfile, {
      keywordTerm: testCase.keywordTerm ?? 'lead generation',
    })
    const actualBand = bandForScore(result.score)

    expect(productionFallback.score).toBe(result.score)
    expect(productionFallback.label).toBe(result.label)
    expect(productionFallback.usage.estimatedCostMicrousd).toBe(0)

    console.log(`INTENT_AUDIT_RESULT ${JSON.stringify({
      id: testCase.id,
      category: testCase.category,
      title: testCase.title,
      text: testCase.text,
      createdAt: testCase.createdAt ?? FRESH_POST_TIMESTAMP,
      sourceTarget: testCase.sourceTarget ?? 'SaaS',
      keywordTerm: testCase.keywordTerm ?? 'lead generation',
      score: result.score,
      label: result.label,
      actualBand,
      expectedBand: testCase.expectedBand,
      correct: actualBand === testCase.expectedBand,
      qualified: result.isQualifiedCandidate,
      shouldUseAi: result.shouldUseAi,
      evidence: result.evidenceSignals,
      noise: result.noiseSignals,
      humanReason: testCase.humanReason,
    })}`)

    expect(actualBand).toBe(testCase.expectedBand)
  })

  it('emits a compact aggregate for the audit report', () => {
    const results = cases.map((testCase) => {
      const result = evaluateIntentPreflight(
        postFromCase(testCase),
        { ...profile, ...testCase.profile },
        {
          keywordTerm: testCase.keywordTerm ?? 'lead generation',
        },
      )
      const actualBand = bandForScore(result.score)
      return {
        id: testCase.id,
        score: result.score,
        label: result.label,
        expectedBand: testCase.expectedBand,
        correct: actualBand === testCase.expectedBand,
        qualified: result.isQualifiedCandidate,
        shouldUseAi: result.shouldUseAi,
        evidence: result.evidenceSignals,
        noise: result.noiseSignals,
      }
    })

    console.log(`INTENT_AUDIT_AGGREGATE ${JSON.stringify(results)}`)
    expect(results).toHaveLength(cases.length)
  })
})
