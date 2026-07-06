"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReplyQueue = exports.sendDigestQueue = exports.scorePostQueue = exports.xFetchQueue = exports.blueskyFetchQueue = exports.redditFetchQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../redis");
exports.redditFetchQueue = new bullmq_1.Queue('fetch-reddit', { connection: redis_1.redis });
exports.blueskyFetchQueue = new bullmq_1.Queue('fetch-bluesky', { connection: redis_1.redis });
exports.xFetchQueue = new bullmq_1.Queue('fetch-x', { connection: redis_1.redis });
// score-post queue uses the same redis connection
exports.scorePostQueue = new bullmq_1.Queue('score-post', { connection: redis_1.redis });
// Queue for reliable email delivery via Resend
exports.sendDigestQueue = new bullmq_1.Queue('send-digest', {
    connection: redis_1.redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        }
    }
});
// Queue for automated or manual reply posting
exports.sendReplyQueue = new bullmq_1.Queue('send-reply', {
    connection: redis_1.redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: true,
        removeOnFail: 100
    }
});
