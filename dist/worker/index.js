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
const express_1 = __importDefault(require("express"));
const api_1 = require("@bull-board/api");
const bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
const express_2 = require("@bull-board/express");
const fetch_reddit_1 = require("./handlers/fetch-reddit");
const fetch_bluesky_1 = require("./handlers/fetch-bluesky");
const fetch_x_1 = require("./handlers/fetch-x");
const score_post_1 = require("./handlers/score-post");
const send_digest_1 = require("./handlers/send-digest");
const send_reply_1 = require("./handlers/send-reply");
const queues_1 = require("../src/lib/queues");
const logger_1 = require("../src/lib/logger");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const Sentry = __importStar(require("@sentry/node"));
// Load environment variables for the standalone worker
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.2,
});
const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379';
const redis = new ioredis_1.default(redisUrl, {
    maxRetriesPerRequest: null,
    family: 0,
    tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
});
redis.on('error', (err) => {
    logger_1.logger.error({ err }, '❌ Redis Connection Error');
    process.exit(1);
});
redis.on('ready', () => {
    logger_1.logger.info('✅ Connected to Redis successfully.');
});
logger_1.logger.info('Starting Scouto workers...');
const fetchRedditWorker = new bullmq_1.Worker('fetch-reddit', fetch_reddit_1.redditFetchHandler, {
    connection: redis,
    limiter: {
        max: 1,
        duration: 1100
    }, // Reddit OAuth: stay under 60 req/min globally
});
fetchRedditWorker.on('ready', () => logger_1.logger.info('🎧 fetch-reddit worker is listening...'));
const fetchBlueskyWorker = new bullmq_1.Worker('fetch-bluesky', fetch_bluesky_1.blueskyFetchHandler, {
    connection: redis,
    limiter: {
        max: 3,
        duration: 1000
    }, // Bluesky API limits are more generous
});
fetchBlueskyWorker.on('ready', () => logger_1.logger.info('🎧 fetch-bluesky worker is listening...'));
const fetchXWorker = new bullmq_1.Worker('fetch-x', fetch_x_1.xFetchHandler, {
    connection: redis,
    limiter: {
        max: 180,
        duration: 900000
    }
});
fetchXWorker.on('ready', () => logger_1.logger.info('🎧 fetch-x worker is listening...'));
const scorePostWorker = new bullmq_1.Worker('score-post', score_post_1.scorePostHandler, {
    connection: redis,
    concurrency: 10, // AI processing can be heavily parallelized
});
scorePostWorker.on('ready', () => logger_1.logger.info('🎧 score-post worker is listening...'));
logger_1.logger.info('Workers initialized. Waiting for connections...');
const captureJobError = (job, err) => {
    Sentry.captureException(err, {
        tags: {
            jobId: job?.id,
            jobName: job?.name,
            queueName: job?.queueName,
            target: job?.data?.target,
            userId: job?.data?.userId,
            platform: job?.data?.platform
        },
        extra: { data: job?.data }
    });
};
fetchRedditWorker.on('failed', captureJobError);
fetchBlueskyWorker.on('failed', captureJobError);
fetchXWorker.on('failed', captureJobError);
scorePostWorker.on('failed', captureJobError);
const sendReplyWorker = new bullmq_1.Worker('send-reply', send_reply_1.sendReplyHandler, {
    connection: redis,
    concurrency: 5,
});
sendReplyWorker.on('ready', () => logger_1.logger.info('🎧 send-reply worker is listening...'));
sendReplyWorker.on('failed', captureJobError);
const sendDigestWorker = new bullmq_1.Worker('send-digest', send_digest_1.sendDigestHandler, {
    connection: redis,
    concurrency: 5,
});
sendDigestWorker.on('ready', () => logger_1.logger.info('🎧 send-digest worker is listening...'));
sendDigestWorker.on('failed', captureJobError);
// Worker Heartbeat (Healthchecks.io or similar)
if (process.env.WORKER_HEALTHCHECK_URL) {
    setInterval(() => {
        fetch(process.env.WORKER_HEALTHCHECK_URL)
            .catch(e => logger_1.logger.error({ e }, 'Worker heartbeat failed'));
    }, 60 * 1000); // Ping every minute
}
// Setup Bull Board
const serverAdapter = new express_2.ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
(0, api_1.createBullBoard)({
    queues: [
        new bullMQAdapter_1.BullMQAdapter(queues_1.redditFetchQueue),
        new bullMQAdapter_1.BullMQAdapter(queues_1.blueskyFetchQueue),
        new bullMQAdapter_1.BullMQAdapter(queues_1.xFetchQueue),
        new bullMQAdapter_1.BullMQAdapter(queues_1.scorePostQueue),
        new bullMQAdapter_1.BullMQAdapter(queues_1.sendDigestQueue),
        new bullMQAdapter_1.BullMQAdapter(queues_1.sendReplyQueue),
    ],
    serverAdapter,
});
const app = (0, express_1.default)();
// Basic auth for Bull Board based on ADMIN_EMAILS or a simple secret
const adminSecret = process.env.ADMIN_SECRET || 'scouto_admin';
app.use('/admin/queues', (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${adminSecret}`) {
        // In production, you might want to use real Basic Auth or a session cookie
        // For a standalone worker on a non-public port, this acts as a first line of defense
        return res.status(401).send('Unauthorized');
    }
    next();
}, serverAdapter.getRouter());
const port = process.env.WORKER_PORT || 3001;
app.listen(port, () => {
    logger_1.logger.info(`bull-board running on http://localhost:${port}/admin/queues`);
});
