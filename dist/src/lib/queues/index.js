"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scorePostQueue = exports.xFetchQueue = exports.blueskyFetchQueue = exports.redditFetchQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../redis");
exports.redditFetchQueue = new bullmq_1.Queue('fetch-reddit', { connection: redis_1.redis });
exports.blueskyFetchQueue = new bullmq_1.Queue('fetch-bluesky', { connection: redis_1.redis });
exports.xFetchQueue = new bullmq_1.Queue('fetch-x', { connection: redis_1.redis });
// score-post queue uses the same redis connection
exports.scorePostQueue = new bullmq_1.Queue('score-post', { connection: redis_1.redis });
