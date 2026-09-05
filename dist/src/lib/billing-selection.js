"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSelectedBillingPlan = normalizeSelectedBillingPlan;
exports.normalizeSelectedBillingCadence = normalizeSelectedBillingCadence;
exports.withSelectedPlan = withSelectedPlan;
exports.afterAuthenticationDestination = afterAuthenticationDestination;
function normalizeSelectedBillingPlan(value) {
    return value === 'starter' || value === 'pro' || value === 'growth' ? value : null;
}
function normalizeSelectedBillingCadence(value) {
    return value === 'annual' ? 'annual' : 'monthly';
}
function withSelectedPlan(pathname, value, cadence) {
    const plan = normalizeSelectedBillingPlan(value);
    if (!plan)
        return pathname;
    const params = new URLSearchParams({ plan });
    if (cadence !== undefined) {
        params.set('billing', normalizeSelectedBillingCadence(cadence));
    }
    return `${pathname}?${params}`;
}
function afterAuthenticationDestination(value, onboardingComplete, cadence) {
    const plan = normalizeSelectedBillingPlan(value);
    if (!onboardingComplete)
        return withSelectedPlan('/onboarding', plan, cadence);
    if (!plan)
        return '/dashboard';
    const params = new URLSearchParams({
        section: 'plan',
        upgrade: plan,
        billing: normalizeSelectedBillingCadence(cadence),
    });
    return `/settings?${params}`;
}
