"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertAttributionToken = assertAttributionToken;
exports.buildAttributionShortUrl = buildAttributionShortUrl;
exports.buildAttributionDestinationUrl = buildAttributionDestinationUrl;
const ATTRIBUTION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
function assertAttributionToken(token) {
    if (!ATTRIBUTION_TOKEN_PATTERN.test(token)) {
        throw new Error('Invalid attribution token');
    }
    return token;
}
function buildAttributionShortUrl(appUrl, token) {
    const safeToken = assertAttributionToken(token);
    const url = new URL(appUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/r/${safeToken}`.replace(/\/{2,}/g, '/');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
}
function buildAttributionDestinationUrl(businessUrl, token) {
    const safeToken = assertAttributionToken(token);
    const url = (0, outbound_url_1.getSafeAttributionRedirectUrl)(businessUrl);
    if (!url) {
        throw new Error('Invalid attribution destination');
    }
    url.searchParams.set('ref', 'buyerwatch');
    url.searchParams.set('sid', safeToken);
    return url.toString();
}
const outbound_url_1 = require("./security/outbound-url");
