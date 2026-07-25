"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.actionRateLimit = exports.authRateLimit = void 0;
exports.getIp = getIp;
const ratelimit_1 = require("@upstash/ratelimit");
const headers_1 = require("next/headers");
const ioredis_1 = __importDefault(require("ioredis"));
class MemoryLimiter {
    maximum;
    windowMs;
    entries = new Map();
    constructor(maximum, windowMs) {
        this.maximum = maximum;
        this.windowMs = windowMs;
    }
    async limit(key) {
        const now = Date.now();
        const recent = (this.entries.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs);
        if (recent.length >= this.maximum)
            return { success: false };
        recent.push(now);
        this.entries.set(key, recent);
        return { success: true };
    }
}
const redisClient = process.env.UPSTASH_REDIS_URL
    ? new ioredis_1.default(process.env.UPSTASH_REDIS_URL, {
        lazyConnect: true,
        tls: process.env.UPSTASH_REDIS_URL.startsWith('rediss://') ? {} : undefined,
    })
    : null;
const redisAdapter = redisClient
    ? {
        sadd: async (key, ...members) => redisClient.sadd(key, ...members),
        eval: async (script, keys, args) => redisClient.eval(script, keys.length, ...keys, ...args),
        evalsha: async (sha, keys, args) => redisClient.evalsha(sha, keys.length, ...keys, ...args),
    }
    : null;
exports.authRateLimit = redisAdapter
    ? new ratelimit_1.Ratelimit({
        redis: redisAdapter,
        limiter: ratelimit_1.Ratelimit.slidingWindow(5, '15 m'),
        analytics: false,
    })
    : new MemoryLimiter(5, 15 * 60_000);
exports.actionRateLimit = redisAdapter
    ? new ratelimit_1.Ratelimit({
        redis: redisAdapter,
        limiter: ratelimit_1.Ratelimit.slidingWindow(10, '1 m'),
        analytics: false,
    })
    : new MemoryLimiter(10, 60_000);
async function getIp() {
    const headersList = await (0, headers_1.headers)();
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    return forwardedFor?.split(',')[0]?.trim() || realIp?.trim() || 'unknown';
}
