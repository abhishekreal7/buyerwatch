import { getPlanLimits } from './plan-limits'
import { getEntitledPlan, type BillingIdentity } from './billing-entitlements'

export type AutoSendPolicySnapshot = BillingIdentity & {
  auto_send_enabled: boolean | null
  auto_send_daily_limit: number | null
  auto_send_platforms: string[] | null
  auto_send_communities: string[] | null
}

export function queuedAutoSendBlockReason(
  profile: AutoSendPolicySnapshot,
  platform: 'reddit' | 'bluesky' | 'x',
  sourceTarget: string | undefined,
  options: { redditDirectPostingEnabled: boolean; xDirectPostingEnabled?: boolean },
): string | null {
  if (!profile.auto_send_enabled) return 'auto_send_disabled'
  if (!getPlanLimits(getEntitledPlan(profile)).autoSend) return 'auto_send_plan_ineligible'

  const enabledPlatforms = Array.isArray(profile.auto_send_platforms)
    ? profile.auto_send_platforms
    : ['bluesky']
  if (!enabledPlatforms.includes(platform)) return 'auto_send_platform_disabled'

  const allowedCommunities = Array.isArray(profile.auto_send_communities)
    ? profile.auto_send_communities.map(value => value.trim().toLocaleLowerCase()).filter(Boolean)
    : []
  if (allowedCommunities.length > 0) {
    const normalizedTarget = sourceTarget?.trim().toLocaleLowerCase()
    if (!normalizedTarget || !allowedCommunities.includes(normalizedTarget)) {
      return 'auto_send_target_out_of_scope'
    }
  }

  if (platform === 'reddit' && !options.redditDirectPostingEnabled) {
    return 'reddit_direct_posting_unavailable'
  }
  if (platform === 'x' && !options.xDirectPostingEnabled) return 'x_direct_posting_unavailable'
  return null
}
