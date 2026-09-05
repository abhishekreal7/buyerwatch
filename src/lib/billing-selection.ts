export type SelectedBillingPlan = 'starter' | 'pro' | 'growth'
export type SelectedBillingCadence = 'monthly' | 'annual'

export function normalizeSelectedBillingPlan(value: unknown): SelectedBillingPlan | null {
  return value === 'starter' || value === 'pro' || value === 'growth' ? value : null
}

/**
 * BuyerWatch has no public free plan. A signup without an explicit pricing
 * selection therefore enters the card-verified Starter trial by default.
 */
export function selectedPlanForSignup(value: unknown): SelectedBillingPlan {
  return normalizeSelectedBillingPlan(value) ?? 'starter'
}

export function normalizeSelectedBillingCadence(value: unknown): SelectedBillingCadence {
  return value === 'annual' ? 'annual' : 'monthly'
}

export function withSelectedPlan(
  pathname: string,
  value: unknown,
  cadence?: unknown,
): string {
  const plan = normalizeSelectedBillingPlan(value)
  if (!plan) return pathname
  const params = new URLSearchParams({ plan })
  if (cadence !== undefined) {
    params.set('billing', normalizeSelectedBillingCadence(cadence))
  }
  return `${pathname}?${params}`
}

export function afterAuthenticationDestination(
  value: unknown,
  onboardingComplete: boolean,
  cadence?: unknown,
): string {
  const plan = normalizeSelectedBillingPlan(value)
  if (!onboardingComplete) return withSelectedPlan('/onboarding', plan, cadence)
  if (!plan) return '/dashboard'
  const params = new URLSearchParams({
    section: 'plan',
    upgrade: plan,
    billing: normalizeSelectedBillingCadence(cadence),
  })
  return `/settings?${params}`
}

export function afterOnboardingDestination(
  value: unknown,
  cadence?: unknown,
  initialScanQueued = false,
): string {
  const plan = normalizeSelectedBillingPlan(value)
  if (plan) {
    const params = new URLSearchParams({
      section: 'plan',
      upgrade: plan,
      billing: normalizeSelectedBillingCadence(cadence),
      activation: 'complete',
      scan: initialScanQueued ? 'queued' : 'scheduled',
    })
    return `/settings?${params}`
  }

  const params = new URLSearchParams({
    activation: 'complete',
    scan: initialScanQueued ? 'queued' : 'scheduled',
  })
  return `/opportunities?${params}`
}
