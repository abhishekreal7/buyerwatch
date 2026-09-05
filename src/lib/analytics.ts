export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window === 'undefined') return
  try {
    const posthog = (window as any).posthog
    if (posthog && typeof posthog.capture === 'function') {
      posthog.capture(eventName, properties)
    }
  } catch {
    // Analytics failure should never break user interactions
  }
}
