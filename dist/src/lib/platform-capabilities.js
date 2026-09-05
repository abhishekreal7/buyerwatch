"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlatformCapabilities = getPlatformCapabilities;
exports.isDirectAutomationAvailable = isDirectAutomationAvailable;
function getPlatformCapabilities(platform, options = {}) {
    if (platform === 'reddit') {
        return {
            discovery: 'scheduled',
            delivery: options.redditDirectPosting ? 'direct' : 'manual',
            identity: 'customer_account',
            proof: options.redditDirectPosting ? 'provider_permalink' : 'manual_confirmation',
            // Sprinklr is the official data-partner path. Browser automation and
            // RedditAPIs remain explicitly provisional compatibility paths.
            compliance: options.redditDirectPosting
                ? options.redditProvider === 'sprinklr' ? 'approved' : 'provisional'
                : 'restricted',
            freshness: options.redditProvider === 'sprinklr' ? 'streaming' : 'scheduled_poll',
            requiresUserSubmit: !options.redditDirectPosting,
            canConfirmPermalink: true,
        };
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
        };
    }
    if (platform === 'x') {
        return {
            discovery: 'public_api', delivery: options.xDirectPosting ? 'direct' : 'manual', identity: 'customer_account',
            proof: options.xDirectPosting ? 'provider_permalink' : 'manual_confirmation', compliance: options.xDirectPosting ? 'approved' : 'restricted',
            freshness: 'scheduled_poll', requiresUserSubmit: !options.xDirectPosting, canConfirmPermalink: true,
        };
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
    };
}
function isDirectAutomationAvailable(platform, options = {}) {
    return getPlatformCapabilities(platform, options).delivery === 'direct';
}
