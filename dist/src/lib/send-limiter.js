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
    x: { maxPerHour: 8, minGapSeconds: 90 },
};
async function reserveSendSlot(userId, platform, options = {}) {
    const { maxPerHour, minGapSeconds: defaultMinGapSeconds } = POST_LIMITS[platform];
    const minGapSeconds = Math.max(defaultMinGapSeconds, Math.min(24 * 60 * 60, options.minimumGapSeconds ?? defaultMinGapSeconds));
    const maxPerDay = Math.max(1, Math.min(100, options.maxPerDay ?? 100));
    const normalizedCommunity = options.community?.trim().toLocaleLowerCase().replace(/[^a-z0-9_.-]/g, '') ?? '';
    const communityGapSeconds = normalizedCommunity
        ? Math.max(0, Math.min(7 * 24 * 60 * 60, options.communityGapSeconds ?? 0))
        : 0;
    const now = Date.now();
    const currentHour = Math.floor(now / 3_600_000);
    const currentDay = new Date(now).toISOString().slice(0, 10);
    const countKey = `post-count:${userId}:${platform}:${currentHour}`;
    const dailyCountKey = `post-count:${userId}:${platform}:${currentDay}`;
    const gapKey = `last-post:${userId}:${platform}`;
    const communityGapKey = `last-post-community:${userId}:${platform}:${normalizedCommunity || 'none'}`;
    const reservationKey = `post-reservation:${userId}:${platform}`;
    const token = (0, node_crypto_1.randomUUID)();
    const script = `
    local count = tonumber(redis.call('GET', KEYS[1]) or '0')
    if count >= tonumber(ARGV[1]) then return {0, 1} end
    local daily = tonumber(redis.call('GET', KEYS[2]) or '0')
    if daily >= tonumber(ARGV[2]) then return {0, 4} end
    local last = tonumber(redis.call('GET', KEYS[3]) or '0')
    if last > 0 and (tonumber(ARGV[3]) - last) < tonumber(ARGV[4]) then return {0, 2, last} end
    local communityLast = tonumber(redis.call('GET', KEYS[4]) or '0')
    if tonumber(ARGV[7]) > 0 and communityLast > 0 and (tonumber(ARGV[3]) - communityLast) < tonumber(ARGV[7]) then return {0, 5, communityLast} end
    if not redis.call('SET', KEYS[5], ARGV[5], 'NX', 'PX', ARGV[6]) then return {0, 3} end
    return {1}
  `;
    try {
        const result = await redis_1.redis.eval(script, 5, countKey, dailyCountKey, gapKey, communityGapKey, reservationKey, maxPerHour, maxPerDay, now, minGapSeconds * 1_000, token, 10 * 60_000, communityGapSeconds * 1_000);
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
        if (result[1] === 4) {
            const reset = Date.parse(`${new Date(now + 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
            return { allowed: false, reason: 'daily_limit', reset };
        }
        if (result[1] === 5) {
            return {
                allowed: false,
                reason: 'community_cooldown',
                reset: Number(result[2]) + communityGapSeconds * 1_000,
            };
        }
        return { allowed: false, reason: 'send_in_progress', reset: now + 60_000 };
    }
    catch (error) {
        logger_1.logger.error({ error }, 'Unable to reserve a send rate-limit slot');
        return { allowed: false, reason: 'rate_limiter_unavailable', reset: now + 60_000 };
    }
}
async function recordSuccessfulSend(userId, platform, token, options = {}) {
    const now = Date.now();
    const currentHour = Math.floor(now / 3_600_000);
    const currentDay = new Date(now).toISOString().slice(0, 10);
    const countKey = `post-count:${userId}:${platform}:${currentHour}`;
    const dailyCountKey = `post-count:${userId}:${platform}:${currentDay}`;
    const gapKey = `last-post:${userId}:${platform}`;
    const normalizedCommunity = options.community?.trim().toLocaleLowerCase().replace(/[^a-z0-9_.-]/g, '') ?? '';
    const communityGapKey = `last-post-community:${userId}:${platform}:${normalizedCommunity || 'none'}`;
    const reservationKey = `post-reservation:${userId}:${platform}`;
    const script = `
    if redis.call('GET', KEYS[5]) ~= ARGV[1] then return 0 end
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], 3700) end
    local daily = redis.call('INCR', KEYS[2])
    if daily == 1 then redis.call('EXPIRE', KEYS[2], 90000) end
    redis.call('SET', KEYS[3], ARGV[2], 'EX', 3700)
    if ARGV[3] == '1' then redis.call('SET', KEYS[4], ARGV[2], 'EX', 604800) end
    redis.call('DEL', KEYS[5])
    return 1
  `;
    const recorded = await redis_1.redis.eval(script, 5, countKey, dailyCountKey, gapKey, communityGapKey, reservationKey, token, now, normalizedCommunity ? '1' : '0');
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
