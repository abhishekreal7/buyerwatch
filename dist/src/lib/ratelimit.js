"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRateLimit = exports.webhookRateLimit = exports.fetchNowRateLimit = exports.aiRateLimit = exports.actionRateLimit = exports.authRateLimit = void 0;
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
function createLimiter(maximum, window, windowMs) {
    return redisAdapter
        ? new ratelimit_1.Ratelimit({
            redis: redisAdapter,
            limiter: ratelimit_1.Ratelimit.slidingWindow(maximum, window),
            analytics: false,
        })
        : new MemoryLimiter(maximum, windowMs);
}
exports.authRateLimit = createLimiter(5, '15 m', 15 * 60_000);
exports.actionRateLimit = createLimiter(10, '1 m', 60_000);
exports.aiRateLimit = createLimiter(8, '1 h', 60 * 60_000);
exports.fetchNowRateLimit = createLimiter(4, '1 h', 60 * 60_000);
exports.webhookRateLimit = createLimiter(30, '1 m', 60_000);
exports.settingsRateLimit = createLimiter(20, '1 h', 60 * 60_000);
async function getIp() {
    const headersList = await (0, headers_1.headers)();
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    return forwardedFor?.split(',')[0]?.trim() || realIp?.trim() || 'unknown';
}
