"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HYPERBROWSER_HEALTH_MAX_AGE_MS = exports.HYPERBROWSER_HEALTH_KEY = void 0;
exports.parseHyperbrowserHealthSnapshot = parseHyperbrowserHealthSnapshot;
exports.readHyperbrowserHealth = readHyperbrowserHealth;
exports.recordHyperbrowserHealth = recordHyperbrowserHealth;
const redis_1 = require("./redis");
exports.HYPERBROWSER_HEALTH_KEY = 'health:reddit-delivery:hyperbrowser:v1';
exports.HYPERBROWSER_HEALTH_MAX_AGE_MS = 7 * 60 * 60_000;
function parseHyperbrowserHealthSnapshot(value) {
    if (!value)
        return null;
    try {
        const parsed = JSON.parse(value);
        if ((parsed.status !== 'ok' && parsed.status !== 'error')
            || typeof parsed.checkedAt !== 'string'
            || !Number.isFinite(Date.parse(parsed.checkedAt))
            || (parsed.code !== undefined && typeof parsed.code !== 'string')
            || (parsed.creditsRemaining !== undefined && !Number.isFinite(parsed.creditsRemaining))
            || (parsed.creditsLimit !== undefined && !Number.isFinite(parsed.creditsLimit)))
            return null;
        return {
            status: parsed.status,
            checkedAt: parsed.checkedAt,
            ...(parsed.code ? { code: parsed.code.slice(0, 160) } : {}),
            ...(parsed.creditsRemaining !== undefined
                ? { creditsRemaining: parsed.creditsRemaining }
                : {}),
            ...(parsed.creditsLimit !== undefined ? { creditsLimit: parsed.creditsLimit } : {}),
        };
    }
    catch {
        return null;
    }
}
async function readHyperbrowserHealth() {
    return parseHyperbrowserHealthSnapshot(await redis_1.redis.get(exports.HYPERBROWSER_HEALTH_KEY));
}
async function recordHyperbrowserHealth(snapshot) {
    const value = {
        ...snapshot,
        checkedAt: snapshot.checkedAt ?? new Date().toISOString(),
    };
    await redis_1.redis.set(exports.HYPERBROWSER_HEALTH_KEY, JSON.stringify(value), 'EX', value.status === 'ok' ? 8 * 60 * 60 : 30 * 60);
}
