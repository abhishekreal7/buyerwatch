"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.actionRateLimit = exports.authRateLimit = void 0;
exports.getIp = getIp;
const ratelimit_1 = require("@upstash/ratelimit");
const headers_1 = require("next/headers");
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in env
// Since we only have UPSTASH_REDIS_URL right now, we can use ioredis with upstash ratelimit or we need upstash redis rest tokens.
// But upstash/ratelimit actually supports standard Redis clients via adapter, or we can just use upstash/redis if rest url is provided.
// Let's create an ioredis adapter for @upstash/ratelimit
const ioredis_1 = __importDefault(require("ioredis"));
let redisClient = null;
if (process.env.UPSTASH_REDIS_URL) {
    redisClient = new ioredis_1.default(process.env.UPSTASH_REDIS_URL);
}
// Minimal adapter for Upstash Ratelimit using ioredis
const redisAdapter = redisClient ? {
    sadd: async (key, ...members) => redisClient.sadd(key, ...members),
    eval: async (script, keys, args) => {
        // ioredis eval takes: script, numKeys, ...keys, ...args
        return redisClient.eval(script, keys.length, ...keys, ...args);
    },
    evalsha: async (sha, keys, args) => {
        // ioredis evalsha takes: sha, numKeys, ...keys, ...args
        return redisClient.evalsha(sha, keys.length, ...keys, ...args);
    }
} : null;
exports.authRateLimit = redisAdapter ? new ratelimit_1.Ratelimit({
    redis: redisAdapter,
    limiter: ratelimit_1.Ratelimit.slidingWindow(5, '15 m'),
    analytics: false,
}) : null;
exports.actionRateLimit = redisAdapter ? new ratelimit_1.Ratelimit({
    redis: redisAdapter,
    limiter: ratelimit_1.Ratelimit.slidingWindow(10, '1 m'),
    analytics: false,
}) : null;
async function getIp() {
    const headersList = await (0, headers_1.headers)();
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    if (realIp) {
        return realIp.trim();
    }
    return '127.0.0.1';
}
