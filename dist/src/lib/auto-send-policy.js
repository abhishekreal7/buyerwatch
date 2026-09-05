"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queuedAutoSendBlockReason = queuedAutoSendBlockReason;
const plan_limits_1 = require("./plan-limits");
function queuedAutoSendBlockReason(profile, platform, sourceTarget, options) {
    if (!profile.auto_send_enabled)
        return 'auto_send_disabled';
    if (!(0, plan_limits_1.getPlanLimits)(profile.plan).autoSend)
        return 'auto_send_plan_ineligible';
    const enabledPlatforms = Array.isArray(profile.auto_send_platforms)
        ? profile.auto_send_platforms
        : ['bluesky'];
    if (!enabledPlatforms.includes(platform))
        return 'auto_send_platform_disabled';
    const allowedCommunities = Array.isArray(profile.auto_send_communities)
        ? profile.auto_send_communities.map(value => value.trim().toLocaleLowerCase()).filter(Boolean)
        : [];
    if (allowedCommunities.length > 0) {
        const normalizedTarget = sourceTarget?.trim().toLocaleLowerCase();
        if (!normalizedTarget || !allowedCommunities.includes(normalizedTarget)) {
            return 'auto_send_target_out_of_scope';
        }
    }
    if (platform === 'reddit' && !options.redditDirectPostingEnabled) {
        return 'reddit_direct_posting_unavailable';
    }
    if (platform === 'x' && !options.xDirectPostingEnabled)
        return 'x_direct_posting_unavailable';
    return null;
}
