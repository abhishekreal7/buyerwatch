export type SelectedBillingPlan = 'starter' | 'pro' | 'growth'

export function normalizeSelectedBillingPlan(value: unknown): SelectedBillingPlan | null {
  return value === 'starter' || value === 'pro' || value === 'growth' ? value : null
}

export function withSelectedPlan(pathname: string, value: unknown): string {
  const plan = normalizeSelectedBillingPlan(value)
  return plan ? `${pathname}?plan=${plan}` : pathname
}

export function afterAuthenticationDestination(
  value: unknown,
  onboardingComplete: boolean,
): string {
  const plan = normalizeSelectedBillingPlan(value)
  if (!onboardingComplete) return withSelectedPlan('/onboarding', plan)
  return plan ? `/settings?section=plan&upgrade=${plan}` : '/dashboard'
}
