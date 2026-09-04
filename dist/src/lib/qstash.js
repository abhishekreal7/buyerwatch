"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasQStashConfiguration = hasQStashConfiguration;
exports.verifyQStashRequest = verifyQStashRequest;
exports.publishQStashJson = publishQStashJson;
exports.cancelQStashMessage = cancelQStashMessage;
exports.publishMonitoringRun = publishMonitoringRun;
const qstash_1 = require("@upstash/qstash");
const app_url_1 = require("./app-url");
function hasQStashConfiguration() {
    return Boolean(process.env.QSTASH_TOKEN?.trim()
        && process.env.QSTASH_CURRENT_SIGNING_KEY?.trim()
        && process.env.QSTASH_NEXT_SIGNING_KEY?.trim());
}
async function verifyQStashRequest(request, body) {
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();
    const signature = request.headers.get('upstash-signature');
    if (!currentSigningKey || !nextSigningKey || !signature)
        return false;
    const receiver = new qstash_1.Receiver({ currentSigningKey, nextSigningKey });
    try {
        return await receiver.verify({
            signature,
            body,
            url: request.url,
            upstashRegion: request.headers.get('upstash-region') ?? undefined,
        });
    }
    catch {
        return false;
    }
}
async function publishQStashJson(path, body, options = {}) {
    const token = process.env.QSTASH_TOKEN?.trim();
    if (!token)
        return null;
    const result = await new qstash_1.Client({ token }).publishJSON({
        url: `${(0, app_url_1.getAppUrl)()}${path.startsWith('/') ? path : `/${path}`}`,
        body,
        retries: options.retries ?? 2,
        timeout: options.timeout ?? '4m',
        flowControl: options.flowControl,
    });
    return 'messageId' in result ? result.messageId : null;
}
async function cancelQStashMessage(messageId) {
    const token = process.env.QSTASH_TOKEN?.trim();
    if (!token)
        throw new Error('QStash is not configured');
    const result = await new qstash_1.Client({ token }).messages.cancel(messageId);
    return result.cancelled;
}
function publishMonitoringRun(forceUserId, forceTarget, forcePlatform) {
    return publishQStashJson('/api/cron/enqueue', forceUserId
        ? {
            forceUserId,
            ...(forceTarget ? { forceTarget } : {}),
            ...(forcePlatform ? { forcePlatform } : {}),
        }
        : {});
}
