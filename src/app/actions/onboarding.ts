'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getServiceRoleClient } from '@/lib/admin'
import { logger } from '@/lib/logger'
import { getPlanLimits } from '@/lib/plan-limits'
import { getEntitledPlan } from '@/lib/billing-entitlements'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { publishMonitoringRun } from '@/lib/qstash'
import { afterAuthenticationDestination, afterOnboardingDestination } from '@/lib/billing-selection'
import {
  normalizeWebsiteUrl,
  validateOnboardingData,
  type OnboardingData,
  type OnboardingKeyword,
} from '@/lib/onboarding-validation'

type InsertedKeyword = OnboardingKeyword & { id: string }

type ProfileSnapshot = {
  business_name: string | null
  business_description: string | null
  business_url: string | null
  business_type: string | null
  writing_style: string | null
  reddit_username: string | null
  discovery_source: string | null
  plan: string | null
  billing_status: string | null
  billing_subscription_id: string | null
}

async function completeWithoutRpc(
  userId: string,
  data: OnboardingData,
  keywords: OnboardingKeyword[],
): Promise<{ inserted?: InsertedKeyword[]; error?: string }> {
  const admin = getServiceRoleClient()
  const { data: existingProfile, error: profileReadError } = await admin
    .from('profiles')
    .select('business_name, business_description, business_url, business_type, writing_style, reddit_username, discovery_source, plan, billing_status, billing_subscription_id')
    .eq('id', userId)
    .maybeSingle<ProfileSnapshot>()

  if (profileReadError) {
    logger.error({ err: profileReadError, userId }, 'Unable to read profile during onboarding fallback')
    return { error: 'We could not prepare your account. Please try again.' }
  }

  const plan = getEntitledPlan(existingProfile)
  const limit = Number(getPlanLimits(plan).keywords)
  const { count, error: countError } = await admin
    .from('keywords')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countError) {
    logger.error({ err: countError, userId }, 'Unable to count monitoring rules during onboarding fallback')
    return { error: 'We could not verify your monitoring limit. Please try again.' }
  }

  const available = Math.max(0, limit - (count ?? 0))
  if (keywords.length > available) {
    return {
      error: `Your ${plan} plan can activate ${limit} monitoring ${limit === 1 ? 'rule' : 'rules'}.`,
    }
  }

  const profileValues = {
    id: userId,
    business_name: data.business_name.trim(),
    business_description: data.business_description.trim(),
    business_url: data.business_url.trim(),
    business_type: data.business_type,
    writing_style: data.writing_style.trim(),
    reddit_username: data.reddit_username.trim() || null,
    discovery_source: data.discovery_source,
  }
  const { error: profileWriteError } = await admin
    .from('profiles')
    .upsert(profileValues, { onConflict: 'id' })

  if (profileWriteError) {
    logger.error({ err: profileWriteError, userId }, 'Unable to save profile during onboarding fallback')
    return { error: 'We could not save your product details. Please try again.' }
  }

  const { data: inserted, error: keywordWriteError } = await admin
    .from('keywords')
    .insert(keywords.map((keyword) => ({ ...keyword, user_id: userId, is_active: true })))
    .select('id, term, platform, target')

  if (!keywordWriteError) {
    return { inserted: (inserted ?? []) as InsertedKeyword[] }
  }

  logger.error({ err: keywordWriteError, userId }, 'Unable to save rules during onboarding fallback')

  if (existingProfile) {
    const { error: rollbackError } = await admin
      .from('profiles')
      .update({
        business_name: existingProfile.business_name,
        business_description: existingProfile.business_description,
        business_url: existingProfile.business_url,
        business_type: existingProfile.business_type,
        writing_style: existingProfile.writing_style,
        reddit_username: existingProfile.reddit_username,
        discovery_source: existingProfile.discovery_source,
      })
      .eq('id', userId)
    if (rollbackError) {
      logger.error({ err: rollbackError, userId }, 'Unable to restore profile after onboarding failure')
    }
  } else {
    const { error: rollbackError } = await admin.from('profiles').delete().eq('id', userId)
    if (rollbackError) {
      logger.error({ err: rollbackError, userId }, 'Unable to remove partial onboarding profile')
    }
  }

  return { error: 'We could not save your monitoring rules. Please try again.' }
}

export async function completeOnboardingAction(
  data: OnboardingData,
  selectedPlan?: string | null,
  selectedBilling?: string | null,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  data = { ...data, business_url: normalizeWebsiteUrl(data.business_url) }
  const validationError = validateOnboardingData(data)
  if (validationError) return { error: validationError }

  const ip = await getIp()
  const { success } = await actionRateLimit.limit(`onboarding_${user.id}_${ip}`)
  if (!success) return { error: 'Too many requests. Please try again later.' }

  const seenRules = new Set<string>()
  const keywords = data.keywords
    .map((keyword) => ({
      term: keyword.term.trim(),
      platform: keyword.platform,
      target: keyword.target.trim(),
    }))
    .filter((keyword) => {
      const key = `${keyword.platform}\u0000${keyword.target.toLowerCase()}\u0000${keyword.term.toLowerCase()}`
      if (seenRules.has(key)) return false
      seenRules.add(key)
      return true
    })

  const { data: rpcInserted, error: rpcError } = await supabase.rpc('complete_onboarding', {
    p_business_name: data.business_name.trim(),
    p_business_description: data.business_description.trim(),
    p_business_url: data.business_url.trim(),
    p_business_type: data.business_type,
    p_writing_style: data.writing_style.trim(),
    p_reddit_username: data.reddit_username.trim(),
    p_keywords: keywords,
  })

  let inserted = (rpcInserted ?? []) as InsertedKeyword[]
  if (rpcError?.code === 'PGRST202') {
    logger.warn({ userId: user.id }, 'complete_onboarding RPC is unavailable; using guarded fallback')
    const fallback = await completeWithoutRpc(user.id, data, keywords)
    if (fallback.error) return { error: fallback.error }
    inserted = fallback.inserted ?? []
  } else if (rpcError) {
    logger.error({ err: rpcError, userId: user.id }, 'Unable to complete onboarding')
    if (rpcError.code === 'P0001') {
      return { error: 'Your selected monitoring rules exceed your plan limit.' }
    }
    if (rpcError.code === '22023') {
      return { error: 'One or more monitoring rules are invalid. Go back and review your selections.' }
    }
    return { error: 'We could not launch monitoring. Please try again.' }
  }

  // The onboarding RPC intentionally remains backwards-compatible. Persist the
  // optional discovery answer separately so older deployed RPC signatures can
  // still be used while the profile column is migrated.
  const { error: discoverySourceError } = await getServiceRoleClient()
    .from('profiles')
    .update({ discovery_source: data.discovery_source })
    .eq('id', user.id)
  if (discoverySourceError) {
    logger.error({ err: discoverySourceError, userId: user.id }, 'Unable to save onboarding discovery source')
    return { error: 'We could not save your onboarding preferences. Please try again.' }
  }

  let initialScanQueued = false
  if (inserted.some((keyword) => keyword.platform === 'reddit')) {
    try {
      const messageId = await publishMonitoringRun(user.id)
      initialScanQueued = Boolean(messageId)
      if (!messageId) {
        logger.warn({ userId: user.id }, 'Onboarding saved while QStash monitoring is not configured')
      }
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Onboarding saved but initial monitoring dispatch failed')
    }
  }

  const plan = selectedPlan === 'starter' || selectedPlan === 'pro' || selectedPlan === 'growth'
    ? selectedPlan
    : null
  redirect(afterOnboardingDestination(plan, selectedBilling, initialScanQueued))
}

export async function skipOnboardingAction(
  selectedPlan?: string | null,
  selectedBilling?: string | null,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, business_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_name) {
    const profileData = {
      id: user.id,
      business_name: 'My Workspace',
      business_description: 'General brand monitoring workspace',
      business_type: 'saas',
      writing_style: 'Helpful, concise, direct',
    }

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' })

    if (upsertError) {
      logger.warn({ err: upsertError, userId: user.id }, 'User upsert failed during skip onboarding, attempting update fallback')

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          business_name: 'My Workspace',
          business_description: 'General brand monitoring workspace',
          business_type: 'saas',
          writing_style: 'Helpful, concise, direct',
        })
        .eq('id', user.id)

      if (updateError) {
        logger.error({ err: updateError, userId: user.id }, 'User update failed during skip onboarding, attempting admin fallback')
        try {
          const admin = getServiceRoleClient()
          await admin.from('profiles').upsert(profileData, { onConflict: 'id' })
        } catch (adminErr) {
          logger.error({ err: adminErr, userId: user.id }, 'Admin fallback failed during skip onboarding')
        }
      }
    }
  }

  const plan = selectedPlan === 'starter' || selectedPlan === 'pro' || selectedPlan === 'growth'
    ? selectedPlan
    : null
  redirect(afterAuthenticationDestination(plan, true, selectedBilling))
}
