"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDDIT_DELIVERY_FLOW_CONTROL_KEY = void 0;
exports.getHyperbrowserRedditMaxConcurrency = getHyperbrowserRedditMaxConcurrency;
exports.getRedditDeliveryFlowControl = getRedditDeliveryFlowControl;
exports.REDDIT_DELIVERY_FLOW_CONTROL_KEY = 'reddit-browser-delivery:v1';
function getHyperbrowserRedditMaxConcurrency(raw = process.env.HYPERBROWSER_REDDIT_MAX_CONCURRENCY) {
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 25 ? parsed : 1;
}
function getRedditDeliveryFlowControl(platform) {
    if (platform !== 'reddit')
        return undefined;
    return {
        key: exports.REDDIT_DELIVERY_FLOW_CONTROL_KEY,
        parallelism: getHyperbrowserRedditMaxConcurrency(),
    };
}
