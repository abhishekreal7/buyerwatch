export type SelectedBillingPlan = 'starter' | 'pro' | 'growth'
export type SelectedBillingCadence = 'monthly' | 'annual'

export function normalizeSelectedBillingPlan(value: unknown): SelectedBillingPlan | null {
  return value === 'starter' || value === 'pro' || value === 'growth' ? value : null
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
