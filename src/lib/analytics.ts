'use client'

import { track as trackVercelEvent } from '@vercel/analytics'

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

type AnalyticsProperty = string | number | boolean | null | undefined

/**
 * Tracks a client-side analytics event.
 */
export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, AnalyticsProperty>,
): void {
  try {
    // The application already renders Vercel's <Analytics /> client in the
    // root layout. Sending custom events through the same installed client
    // keeps product telemetry live without adding a second tracker or
    // collecting user identity data.
    trackVercelEvent(event, properties)
  } catch (err) {
    console.warn('[analytics] trackEvent failed:', err)
  }
}
