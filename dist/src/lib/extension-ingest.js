"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExtensionPlatform = isExtensionPlatform;
exports.isValidExtensionSourceUrl = isValidExtensionSourceUrl;
exports.buildExtensionExternalId = buildExtensionExternalId;
exports.buildExtensionScoreJobId = buildExtensionScoreJobId;
const node_crypto_1 = require("node:crypto");
const PLATFORM_HOSTS = {
    reddit: /(^|\.)reddit\.com$/i,
    bluesky: /(^|\.)bsky\.app$/i,
    x: /(^|\.)(x\.com|twitter\.com)$/i,
};
function isExtensionPlatform(value) {
    return value === 'reddit' || value === 'bluesky' || value === 'x';
}
function isValidExtensionSourceUrl(platform, sourceUrl) {
    try {
        const parsed = new URL(sourceUrl);
        return parsed.protocol === 'https:' && PLATFORM_HOSTS[platform].test(parsed.hostname);
    }
    catch {
        return false;
    }
}
function buildExtensionExternalId(platform, sourceEventId) {
    return `${platform}:extension:${sourceEventId}`;
}
function buildExtensionScoreJobId(userId, externalId) {
    const safeId = (0, node_crypto_1.createHash)('sha256').update(externalId).digest('hex').slice(0, 32);
    return `score-${userId}-${safeId}`;
}
