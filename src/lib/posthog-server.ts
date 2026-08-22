import { PostHog } from 'posthog-node'

let _client: PostHog | null = null

/**
 * Returns a singleton PostHog Node client for server-side event capture.
 * Safe to call from API routes and server actions.
 * Always call posthog.shutdown() when you are done in short-lived contexts.
 */
export function getPostHogClient(): PostHog {
  if (!_client) {
    _client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return _client
}
