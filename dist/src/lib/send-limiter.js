"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reserveSendSlot = reserveSendSlot;
exports.recordSuccessfulSend = recordSuccessfulSend;
exports.releaseSendSlot = releaseSendSlot;
exports.checkSendRateLimit = checkSendRateLimit;
const node_crypto_1 = require("node:crypto");
const redis_1 = require("./redis");
const logger_1 = require("./logger");
const POST_LIMITS = {
    reddit: { maxPerHour: 3, minGapSeconds: 300 },
    bluesky: { maxPerHour: 10, minGapSeconds: 60 },
};
async function reserveSendSlot(userId, platform) {
    const { maxPerHour, minGapSeconds } = POST_LIMITS[platform];
    const now = Date.now();
    const currentHour = Math.floor(now / 3_600_000);
    const countKey = `post-count:${userId}:${platform}:${currentHour}`;
    const gapKey = `last-post:${userId}:${platform}`;
    const reservationKey = `post-reservation:${userId}:${platform}`;
    const token = (0, node_crypto_1.randomUUID)();
    const script = `
    local count = tonumber(redis.call('GET', KEYS[1]) or '0')
    if count >= tonumber(ARGV[1]) then return {0, 1} end
    local last = tonumber(redis.call('GET', KEYS[2]) or '0')
    if last > 0 and (tonumber(ARGV[2]) - last) < tonumber(ARGV[3]) then return {0, 2, last} end
    if not redis.call('SET', KEYS[3], ARGV[4], 'NX', 'PX', ARGV[5]) then return {0, 3} end
    return {1}
  `;
    try {
        const result = await redis_1.redis.eval(script, 3, countKey, gapKey, reservationKey, maxPerHour, now, minGapSeconds * 1_000, token, 10 * 60_000);
        if (result[0] === 1)
            return { allowed: true, token };
        if (result[1] === 1) {
            const reset = (currentHour + 1) * 3_600_000;
            return { allowed: false, reason: 'hourly_limit', reset };
        }
        if (result[1] === 2) {
            return {
                allowed: false,
                reason: 'minimum_gap',
                reset: Number(result[2]) + minGapSeconds * 1_000,
            };
        }
        return { allowed: false, reason: 'send_in_progress', reset: now + 60_000 };
    }
    catch (error) {
        logger_1.logger.error({ error }, 'Unable to reserve a send rate-limit slot');
        return { allowed: false, reason: 'rate_limiter_unavailable', reset: now + 60_000 };
    }
}
async function recordSuccessfulSend(userId, platform, token) {
    const now = Date.now();
    const currentHour = Math.floor(now / 3_600_000);
    const countKey = `post-count:${userId}:${platform}:${currentHour}`;
    const gapKey = `last-post:${userId}:${platform}`;
    const reservationKey = `post-reservation:${userId}:${platform}`;
    const script = `
    if redis.call('GET', KEYS[3]) ~= ARGV[1] then return 0 end
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], 3700) end
    redis.call('SET', KEYS[2], ARGV[2], 'EX', 3700)
    redis.call('DEL', KEYS[3])
    return 1
  `;
    const recorded = await redis_1.redis.eval(script, 3, countKey, gapKey, reservationKey, token, now);
    if (recorded !== 1)
        throw new Error('Send reservation expired before success was recorded');
}
async function releaseSendSlot(userId, platform, token) {
    const reservationKey = `post-reservation:${userId}:${platform}`;
    await redis_1.redis.eval(`if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`, 1, reservationKey, token);
}
/** Readiness probe retained for operational scripts; it never consumes quota. */
async function checkSendRateLimit(userId, platform) {
    const reservation = await reserveSendSlot(userId, platform);
    if (!reservation.allowed)
        return reservation;
    await releaseSendSlot(userId, platform, reservation.token);
    return { allowed: true };
}
