"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSendRateLimit = checkSendRateLimit;
const redis_1 = require("./redis");
const logger_1 = require("./logger");
const POST_LIMITS = {
    reddit: { maxPerHour: 3, minGapSeconds: 300 }, // Max 3 per hour, min 5 minutes between posts
    bluesky: { maxPerHour: 10, minGapSeconds: 60 }, // Max 10 per hour, min 1 minute between posts
};
async function checkSendRateLimit(userId, platform) {
    if (!redis_1.redis) {
        logger_1.logger.warn('Redis not configured, skipping post rate limits. DANGER.');
        return { allowed: true };
    }
    const { maxPerHour, minGapSeconds } = POST_LIMITS[platform];
    // Use current hour as the bucket (e.g. 1709420000000 / 3600000)
    const currentHour = Math.floor(Date.now() / 3600000);
    const hourKey = `post-count:${userId}:${platform}:${currentHour}`;
    const gapKey = `last-post:${userId}:${platform}`;
    try {
        // 1. Check Hourly Limit
        const count = await redis_1.redis.incr(hourKey);
        if (count === 1) {
            await redis_1.redis.expire(hourKey, 3600); // Expire the bucket after 1 hour
        }
        if (count > maxPerHour) {
            // Revert the increment since this attempt is not allowed
            await redis_1.redis.decr(hourKey);
            // Calculate how long until the next hour bucket starts
            const nextHourStart = (currentHour + 1) * 3600000;
            const delayMs = nextHourStart - Date.now();
            return {
                allowed: false,
                reason: `Hourly posting limit reached (${maxPerHour}/hr). Try again later.`,
                reset: Date.now() + delayMs // Used by send-reply.ts to calculate delay
            };
        }
        // 2. Check Minimum Gap Limit
        const lastPostStr = await redis_1.redis.get(gapKey);
        if (lastPostStr) {
            const lastPost = Number(lastPostStr);
            const elapsedSeconds = (Date.now() - lastPost) / 1000;
            if (elapsedSeconds < minGapSeconds) {
                // Revert the hourly increment since we are blocking on the gap limit
                await redis_1.redis.decr(hourKey);
                const remainingSeconds = minGapSeconds - elapsedSeconds;
                const delayMs = Math.ceil(remainingSeconds * 1000);
                return {
                    allowed: false,
                    reason: `Posting too fast. Please wait ${minGapSeconds} seconds between posts on ${platform}.`,
                    reset: Date.now() + delayMs
                };
            }
        }
        // 3. Success: Update the last post timestamp
        await redis_1.redis.set(gapKey, Date.now().toString(), 'EX', 3600); // keep gap state around for at most 1 hour
        return { allowed: true };
    }
    catch (err) {
        logger_1.logger.error({ err }, 'Error checking rate limit in Redis');
        // Fail closed if rate limiting crashes, or fail open?
        // Failing open might spam. Failing closed is safer.
        return { allowed: false, reason: 'Internal rate limit check failed', reset: Date.now() + 60000 };
    }
}
