"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
// Create a singleton instance of Redis
const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379';
exports.redis = new ioredis_1.default(redisUrl, {
    lazyConnect: true,
    // Queue producers and HTTP routes must fail promptly when Redis is down.
    // BullMQ workers use their own blocking connection with null retries.
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    family: 0,
    tls: redisUrl.startsWith('rediss://') ? {} : undefined,
});
