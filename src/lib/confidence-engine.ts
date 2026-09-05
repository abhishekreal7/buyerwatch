import { createClient } from '@supabase/supabase-js'
import { normalizeHighIntentThreshold } from './high-intent-threshold'
import { getPlanLimits } from './plan-limits'
import { getEntitledPlan, type BillingIdentity } from './billing-entitlements'

const MIN_FEEDBACK_FOR_TRUST = 10
const MIN_COMMUNITY_SAMPLE = 10
export const INSTANT_AUTOPILOT_THRESHOLD = 90

export interface AutoSendEvaluation {
  approved: boolean
  reason: string
  dynamicThreshold: number
  automationConfidence: number
  configuredThreshold: number
  userTrust: number
  communityTrust: number
  totalDraftsReviewed: number
}

interface TrustMetrics {
  total_drafts_reviewed: number
  avg_edit_distance: number
}

interface CommunityMetrics {
  total_engagements: number
  rejection_rate: number
}

export type DraftSafetyResult = {
  flagged: boolean
  hasDisclosure: boolean
  mentionedProduct?: boolean
  hasCommercialLink?: boolean
}

export function computeThreshold(avgEditDistance: number): number {
  return 85 - ((avgEditDistance - 0.5) * 10)
}

function blockedDecision(reason: string): AutoSendEvaluation {
  return {
    approved: false,
    reason,
    dynamicThreshold: 100,
    automationConfidence: 0,
    configuredThreshold: 100,
    userTrust: 0,
    communityTrust: 0,
    totalDraftsReviewed: 0,
  }
}

export function evaluateAutoSendContentPolicy(
  draftResult: DraftSafetyResult,
  profile: BillingIdentity & { auto_send_enabled: boolean },
): AutoSendEvaluation | null {
  if (!getPlanLimits(getEntitledPlan(profile)).autoSend) {
    return blockedDecision('auto_send_requires_paid_plan')
  }
  if (!profile.auto_send_enabled) {
    return blockedDecision('auto_send_disabled')
  }
  if (draftResult.flagged) {
    return blockedDecision('reply_quality_blocked')
  }

  const hasCommercialReference = Boolean(
    draftResult.mentionedProduct || draftResult.hasCommercialLink,
  )
  if (hasCommercialReference && !draftResult.hasDisclosure) {
    return blockedDecision('missing_disclosure')
  }
  return null
}

export function evaluateAutoSendIntentPolicy(
  intentScore: number,
  highIntentThreshold: number | undefined,
): AutoSendEvaluation | null {
  if (!Number.isFinite(intentScore)) {
    return blockedDecision('intent_score_unavailable')
  }
  if (intentScore < normalizeHighIntentThreshold(highIntentThreshold)) {
    return blockedDecision('below_high_intent_threshold')
  }
  return null
}

export function calculateAutomationDecision(input: {
  userTrust: number
  communityTrust: number
  learnedThreshold: number
  configuredThreshold?: number
}): AutoSendEvaluation {
  const configuredThreshold = Math.min(100, Math.max(70, input.configuredThreshold ?? 85))
  const dynamicThreshold = Math.max(configuredThreshold, input.learnedThreshold)
  const automationConfidence = (0.70 * input.userTrust) + (0.30 * input.communityTrust)
  const approved = automationConfidence >= dynamicThreshold

  return {
    approved,
    reason: approved ? 'confidence_cleared' : 'below_dynamic_threshold',
    dynamicThreshold,
    automationConfidence,
    configuredThreshold,
    userTrust: input.userTrust,
    communityTrust: input.communityTrust,
    totalDraftsReviewed: 0,
  }
}

export function evaluateInstantAutopilot(input: {
  plan: string
  activatedAt?: string | null
  expiresAt?: string | null
  usedAt?: string | null
  intentScore?: number
  totalDraftsReviewed: number
  now?: number
}): AutoSendEvaluation | null {
  const expiry = Date.parse(input.expiresAt ?? '')
  if (
    input.totalDraftsReviewed >= MIN_FEEDBACK_FOR_TRUST
    || !['starter', 'pro', 'growth'].includes(input.plan)
    || !input.activatedAt
    || !Number.isFinite(expiry)
    || expiry <= (input.now ?? Date.now())
    || input.usedAt
  ) return null

  const instantScore = Number(input.intentScore)
  if (Number.isFinite(instantScore) && instantScore >= INSTANT_AUTOPILOT_THRESHOLD) {
    return {
      approved: true,
      reason: 'instant_autopilot_eligible',
      dynamicThreshold: INSTANT_AUTOPILOT_THRESHOLD,
      automationConfidence: instantScore,
      configuredThreshold: INSTANT_AUTOPILOT_THRESHOLD,
      userTrust: 0,
      communityTrust: 80,
      totalDraftsReviewed: input.totalDraftsReviewed,
    }
  }
  return {
    ...blockedDecision('instant_autopilot_below_threshold'),
    configuredThreshold: INSTANT_AUTOPILOT_THRESHOLD,
    totalDraftsReviewed: input.totalDraftsReviewed,
  }
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return createClient(
    url && url.startsWith('http') ? url : 'https://placeholder.supabase.co',
    key || 'placeholder-key',
  )
}

async function getUserTrustMetrics(userId: string): Promise<TrustMetrics | null> {
  const { data, error } = await getSupabase()
    .from('user_trust_metrics')
    .select('total_drafts_reviewed, avg_edit_distance')
    .eq('user_id', userId)
    .single()

  if (!error) return data as TrustMetrics
  if (error.code === 'PGRST116') return null
  if (error.code === '42P01' || error.message?.includes('schema cache')) return null
  throw new Error(`[confidence-engine] getUserTrustMetrics failed: ${error.code} - ${error.message}`)
}

async function getCommunityMetrics(
  platform: string,
  targetCommunity?: string | null,
): Promise<CommunityMetrics | null> {
  let query = getSupabase()
    .from('community_trust_metrics')
    .select('total_engagements, rejection_rate')
    .eq('platform', platform)

  if (targetCommunity) query = query.eq('target_community', targetCommunity)
  const { data, error } = await query.maybeSingle()

  if (!error) return data as CommunityMetrics | null
  if (error.code === '42P01' || error.message?.includes('schema cache')) return null
  throw new Error(`[confidence-engine] getCommunityMetrics failed: ${error.code} - ${error.message}`)
}

export async function evaluateAutoSend(
  userId: string,
  platform: string,
  draftResult: DraftSafetyResult,
  profile: {
    auto_send_enabled: boolean
    auto_send_threshold?: number
    high_intent_threshold?: number
    plan: string
    instant_autopilot_activated_at?: string | null
    instant_autopilot_expires_at?: string | null
    instant_autopilot_used_at?: string | null
  },
  targetCommunity?: string | null,
  intentScore?: number,
): Promise<AutoSendEvaluation> {
  const userMetrics = await getUserTrustMetrics(userId)
  const totalReviewed = userMetrics?.total_drafts_reviewed ?? 0
  const intentDecision = evaluateAutoSendIntentPolicy(
    intentScore ?? Number.NaN,
    profile.high_intent_threshold,
  )
  if (intentDecision) {
    return { ...intentDecision, totalDraftsReviewed: totalReviewed }
  }
  const contentDecision = evaluateAutoSendContentPolicy(draftResult, profile)
  if (contentDecision) {
    return { ...contentDecision, totalDraftsReviewed: totalReviewed }
  }

  // Community performance can make an earned decision stricter, but it can
  // never replace the user's first ten explicit reviews.
  if (totalReviewed < MIN_FEEDBACK_FOR_TRUST) {
    const instantDecision = evaluateInstantAutopilot({
      plan: profile.plan,
      activatedAt: profile.instant_autopilot_activated_at,
      expiresAt: profile.instant_autopilot_expires_at,
      usedAt: profile.instant_autopilot_used_at,
      intentScore,
      totalDraftsReviewed: totalReviewed,
    })
    if (instantDecision) return instantDecision
    return {
      ...blockedDecision('cold_start_insufficient_data'),
      configuredThreshold: Math.min(100, Math.max(70, profile.auto_send_threshold ?? 85)),
      totalDraftsReviewed: totalReviewed,
    }
  }

  const avgDraftSimilarity = Number(userMetrics!.avg_edit_distance)
  const learnedThreshold = computeThreshold(avgDraftSimilarity)
  const userTrust = avgDraftSimilarity * 100
  const communityMetrics = await getCommunityMetrics(platform, targetCommunity)
  const communityTrust = communityMetrics
    && communityMetrics.total_engagements >= MIN_COMMUNITY_SAMPLE
    ? (1 - Number(communityMetrics.rejection_rate)) * 100
    : 80

  return {
    ...calculateAutomationDecision({
      userTrust,
      communityTrust,
      learnedThreshold,
      configuredThreshold: profile.auto_send_threshold,
    }),
    totalDraftsReviewed: totalReviewed,
  }
}
