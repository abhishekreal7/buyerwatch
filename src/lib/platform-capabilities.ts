import type { NormalizedPost } from './types'

export type SocialPlatform = NormalizedPost['platform']
export type DeliveryMode = 'direct' | 'assisted' | 'manual' | 'unsupported'

export type PlatformCapabilities = {
  discovery: 'scheduled' | 'public_api' | 'browser_capture' | 'unsupported'
  delivery: DeliveryMode
  identity: 'customer_account' | 'delegated_account' | 'none'
  proof: 'provider_permalink' | 'extension_confirmation' | 'manual_confirmation' | 'none'
  compliance: 'approved' | 'provisional' | 'restricted' | 'disabled'
  freshness: 'streaming' | 'scheduled_poll' | 'manual_capture' | 'none'
  requiresUserSubmit: boolean
  canConfirmPermalink: boolean
}

export function getPlatformCapabilities(
  platform: SocialPlatform,
  options: { redditDirectPosting?: boolean } = {},
): PlatformCapabilities {
  if (platform === 'reddit') {
    return {
      discovery: 'scheduled',
      delivery: options.redditDirectPosting ? 'direct' : 'assisted',
      identity: 'customer_account',
      proof: options.redditDirectPosting ? 'provider_permalink' : 'extension_confirmation',
      compliance: options.redditDirectPosting ? 'approved' : 'provisional',
      freshness: 'scheduled_poll',
      requiresUserSubmit: !options.redditDirectPosting,
      canConfirmPermalink: true,
    }
  }
  if (platform === 'bluesky') {
    return {
      discovery: 'public_api',
      delivery: 'direct',
      identity: 'customer_account',
      proof: 'provider_permalink',
      compliance: 'approved',
      freshness: 'scheduled_poll',
      requiresUserSubmit: false,
      canConfirmPermalink: true,
    }
  }
  return {
    discovery: 'unsupported',
    delivery: 'unsupported',
    identity: 'none',
    proof: 'none',
    compliance: 'disabled',
    freshness: 'none',
    requiresUserSubmit: true,
    canConfirmPermalink: false,
  }
}

export function isDirectAutomationAvailable(
  platform: SocialPlatform,
  options: { redditDirectPosting?: boolean } = {},
): boolean {
  return getPlatformCapabilities(platform, options).delivery === 'direct'
}
