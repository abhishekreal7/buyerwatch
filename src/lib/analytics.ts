'use client'

export type AnalyticsEvent =
  | 'user_signed_up'
  | 'user_signed_in'
  | 'user_signed_out'
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'keyword_created'
  | 'keyword_deleted'
  | 'reply_draft_generated'
  | 'reply_regenerated'
  | 'reply_copied'
  | 'reply_posted'
  | 'reply_marked_posted'
  | 'reply_dismissed'
  | 'upgrade_modal_viewed'
  | 'checkout_initiated'

export type UserTraits = {
  email?: string
  name?: string
  plan?: string
  auto_send?: boolean
  business_name?: string
  [key: string]: unknown
}

function isBrowser(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window !== 'undefined'
}

function getPosthog(): { identify: (...a: unknown[]) => void; reset: () => void; capture: (...a: unknown[]) => void } | null {
  if (!isBrowser()) return null
  // PostHog is optional. Read a browser-initialized client when one exists;
  // do not dynamically require a package that is intentionally not installed.
  return (globalThis as typeof globalThis & {
    posthog?: { identify: (...a: unknown[]) => void; reset: () => void; capture: (...a: unknown[]) => void }
  }).posthog ?? null
}

/**
 * Associates current session events with a specific user identity.
 */
export function identifyUser(userId: string, traits?: UserTraits): void {
  try {
    getPosthog()?.identify(userId, traits)
  } catch (err) {
    console.warn('[analytics] identify failed:', err)
  }
}

/**
 * Clears user identity and resets session on logout.
 */
export function resetUser(): void {
  try {
    getPosthog()?.reset()
  } catch (err) {
    console.warn('[analytics] reset failed:', err)
  }
}

/**
 * Tracks a client-side analytics event.
 */
export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  try {
    getPosthog()?.capture(event, properties)
  } catch (err) {
    console.warn('[analytics] trackEvent failed:', err)
  }
}
