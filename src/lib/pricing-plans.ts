import { PLAN_ENTITLEMENTS } from './plan-limits'

function featuresFor(plan: 'starter' | 'pro' | 'growth'): string[] {
  const entitlement = PLAN_ENTITLEMENTS[plan]
  const features = [
    `${entitlement.keywords} keyword monitoring rules`,
    `Up to ${entitlement.monitoredTargets} monitored communities`,
    `Up to ${entitlement.threadsPerMonth.toLocaleString('en-US')} buyer-intent signals/month`,
    `${entitlement.aiDraftsPerMonth.toLocaleString('en-US')} AI-drafted replies/month`,
    'Reddit & Bluesky monitoring',
  ]
  if ((entitlement.monitoringPlatforms as readonly string[]).includes('x')) features.push('X monitoring')
  if (entitlement.pollingIntervalMinutes <= 5) features.push('5-minute polling cadence')
  if (entitlement.autoSend) features.push('Guarded auto-send')
  if (entitlement.slackNotifications) features.push('Slack notifications')
  if (entitlement.replyAttribution) features.push('Reply attribution')
  return features
}

export const PRICING_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$39',
    annualPrice: '$31',
    annualTotal: '$372',
    period: '/month',
    description: 'Start monitoring real buying signals with enough coverage to prove the workflow.',
    features: [
      ...featuresFor('starter'),
      'Manual review and send workflow',
    ],
    cta: 'Start with Starter',
    href: '/signup?plan=starter&billing=monthly',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Professional',
    price: '$99',
    annualPrice: '$79',
    annualTotal: '$948',
    period: '/month',
    description: 'For founders actively working a social selling motion.',
    features: [
      'Everything in Starter',
      ...featuresFor('pro'),
    ],
    cta: 'Upgrade to Professional',
    href: '/signup?plan=pro&billing=monthly',
    highlight: true,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$249',
    annualPrice: '$199',
    annualTotal: '$2,388',
    period: '/month',
    description: 'For teams that need higher limits and faster monitoring.',
    features: [
      'Everything in Professional',
      ...featuresFor('growth'),
    ],
    cta: 'Upgrade to Growth',
    href: '/signup?plan=growth&billing=monthly',
    highlight: false,
  },
] as const
