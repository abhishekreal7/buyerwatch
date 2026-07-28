"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUnsubscribeUrl = createUnsubscribeUrl;
exports.verifyUnsubscribeToken = verifyUnsubscribeToken;
const node_crypto_1 = require("node:crypto");
const app_url_1 = require("./app-url");
function secret() {
    const value = process.env.EMAIL_UNSUBSCRIBE_SECRET;
    if (!value || value.length < 32) {
        throw new Error('EMAIL_UNSUBSCRIBE_SECRET must contain at least 32 characters');
    }
    return value;
}
function createUnsubscribeUrl(userId, now = new Date()) {
    const expires = Math.floor(now.getTime() / 1_000) + 365 * 24 * 60 * 60;
    const payload = `${userId}.${expires}`;
    const signature = (0, node_crypto_1.createHmac)('sha256', secret()).update(payload).digest('base64url');
    const token = Buffer.from(`${payload}.${signature}`).toString('base64url');
    return `${(0, app_url_1.getAppUrl)()}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}
function verifyUnsubscribeToken(token) {
    try {
        const decoded = Buffer.from(token, 'base64url').toString('utf8');
        const [userId, expiresValue, signature] = decoded.split('.');
        const expires = Number(expiresValue);
        if (!/^[0-9a-f-]{36}$/i.test(userId)
            || !Number.isInteger(expires)
            || expires < Math.floor(Date.now() / 1_000)
            || !signature)
            return null;
        const expected = (0, node_crypto_1.createHmac)('sha256', secret())
            .update(`${userId}.${expires}`)
            .digest('base64url');
        const left = Buffer.from(signature);
        const right = Buffer.from(expected);
        return left.length === right.length && (0, node_crypto_1.timingSafeEqual)(left, right) ? userId : null;
    }
    catch {
        return null;
    }
}
