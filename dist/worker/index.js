"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const fetch_reddit_1 = require("./handlers/fetch-reddit");
const fetch_bluesky_1 = require("./handlers/fetch-bluesky");
const fetch_x_1 = require("./handlers/fetch-x");
const score_post_1 = require("./handlers/score-post");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables for the standalone worker
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379';
const redis = new ioredis_1.default(redisUrl, { maxRetriesPerRequest: null });
redis.on('error', (err) => {
    console.error('❌ Redis Connection Error:', err.message);
    process.exit(1);
});
redis.on('ready', () => {
    console.log('✅ Connected to Redis successfully.');
});
console.log('Starting Scouto workers...');
const fetchRedditWorker = new bullmq_1.Worker('fetch-reddit', fetch_reddit_1.redditFetchHandler, {
    connection: redis,
    limiter: {
        max: 1,
        duration: 1100
    }, // Reddit OAuth: stay under 60 req/min globally
});
fetchRedditWorker.on('ready', () => console.log('🎧 fetch-reddit worker is listening...'));
const fetchBlueskyWorker = new bullmq_1.Worker('fetch-bluesky', fetch_bluesky_1.blueskyFetchHandler, {
    connection: redis,
    limiter: {
        max: 3,
        duration: 1000
    }, // Bluesky API limits are more generous
});
fetchBlueskyWorker.on('ready', () => console.log('🎧 fetch-bluesky worker is listening...'));
// X API rate limit is very strict per 15 min window (e.g., 180 requests/15m)
// 15 min = 900000 ms
const fetchXWorker = new bullmq_1.Worker('fetch-x', fetch_x_1.xFetchHandler, {
    connection: redis,
    limiter: {
        max: 180,
        duration: 900000
    }
});
fetchXWorker.on('ready', () => console.log('🎧 fetch-x worker is listening...'));
const scorePostWorker = new bullmq_1.Worker('score-post', score_post_1.scorePostHandler, {
    connection: redis,
    concurrency: 10, // AI processing can be heavily parallelized
});
scorePostWorker.on('ready', () => console.log('🎧 score-post worker is listening...'));
console.log('Workers initialized. Waiting for connections...');
