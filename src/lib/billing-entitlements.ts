import { normalizePlan, type PlanTier } from './plan-limits'

export type BillingStatus =
  | 'free'
  | 'pending'
  | 'active'
  | 'on_hold'
  | 'cancelled'
  | 'failed'
  | 'expired'

export type BillingIdentity = {
  plan?: string | null
  billing_status?: string | null
  billing_subscription_id?: string | null
}

export type BillingDisplayState =
  | 'active'
  | 'attention_required'
  | 'trial_not_started'

/**
 * Paid entitlements exist only when the billing provider has confirmed an
 * active subscription and the profile is tied to that subscription. The plan
 * column describes which paid tier the subscription grants; it is never proof
 * of payment on its own.
 */
export function hasActiveSubscription(profile: BillingIdentity | null | undefined): boolean {
  return profile?.billing_status === 'active'
    && typeof profile.billing_subscription_id === 'string'
    && profile.billing_subscription_id.trim().length > 0
    && normalizePlan(profile.plan) !== 'free'
}

export function getEntitledPlan(profile: BillingIdentity | null | undefined): PlanTier {
  return hasActiveSubscription(profile) ? normalizePlan(profile?.plan) : 'free'
}

export function getBillingDisplayState(
  profile: BillingIdentity | null | undefined,
): BillingDisplayState {
  if (hasActiveSubscription(profile)) return 'active'
  if (profile?.billing_status === 'pending' || profile?.billing_status === 'on_hold') {
    return 'attention_required'
  }
  return 'trial_not_started'
}
