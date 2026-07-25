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
exports.startWorkerRuntime = startWorkerRuntime;
const api_1 = require("@bull-board/api");
const bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
const express_1 = require("@bull-board/express");
const Sentry = __importStar(require("@sentry/node"));
const bullmq_1 = require("bullmq");
const express_2 = __importDefault(require("express"));
const ioredis_1 = __importDefault(require("ioredis"));
const http_1 = require("../src/lib/http");
const logger_1 = require("../src/lib/logger");
const queues_1 = require("../src/lib/queues");
const redis_1 = require("../src/lib/redis");
const fetch_bluesky_1 = require("./handlers/fetch-bluesky");
const check_google_rank_1 = require("./handlers/check-google-rank");
const fetch_reddit_1 = require("./handlers/fetch-reddit");
const score_post_1 = require("./handlers/score-post");
const send_digest_1 = require("./handlers/send-digest");
const send_reply_1 = require("./handlers/send-reply");
const notify_slack_1 = require("./handlers/notify-slack");
const fetch_x_1 = require("./handlers/fetch-x");
const queueEntries = [
    ['fetch-reddit', queues_1.redditFetchQueue],
    ['fetch-bluesky', queues_1.blueskyFetchQueue],
    ['fetch-x', queues_1.xFetchQueue],
    ['score-post', queues_1.scorePostQueue],
    ['send-digest', queues_1.sendDigestQueue],
    ['send-reply', queues_1.sendReplyQueue],
    ['notify-slack', queues_1.notifySlackQueue],
    ['check-google-rank', queues_1.checkGoogleRankQueue],
    ['dead-letter', queues_1.deadLetterQueue],
];
function sanitizeMetricLabel(value) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
async function startWorkerRuntime() {
    const release = process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA;
    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
        release,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
        sendDefaultPii: false,
        beforeSend(event) {
            delete event.user;
            if (event.request) {
                delete event.request.cookies;
                delete event.request.data;
                delete event.request.headers;
                delete event.request.query_string;
            }
            return event;
        },
    });
    const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379';
    const redis = new ioredis_1.default(redisUrl, {
        maxRetriesPerRequest: null,
        family: 0,
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    });
    let redisReady = false;
    let shuttingDown = false;
    const readyWorkers = new Set();
    const metrics = new Map();
    redis.on('error', (error) => {
        redisReady = false;
        logger_1.logger.error({ error }, 'Redis connection error');
    });
    redis.on('ready', () => {
        redisReady = true;
        logger_1.logger.info('Redis connection ready');
    });
    const workers = [];
    const captureJobError = async (job, error) => {
        Sentry.captureException(error, {
            tags: {
                jobName: job?.name,
                queueName: job?.queueName,
                platform: typeof job?.data?.platform === 'string' ? job.data.platform : undefined,
            },
            extra: {
                attemptsMade: job?.attemptsMade,
                configuredAttempts: job?.opts?.attempts,
            },
        });
        const attempts = typeof job?.opts?.attempts === 'number' ? job.opts.attempts : 1;
        if (job && job.attemptsMade >= attempts) {
            await queues_1.deadLetterQueue.add('failed-job', {
                queueName: job.queueName,
                jobId: job.id,
                jobName: job.name,
                failedAt: new Date().toISOString(),
                error: error.message.slice(0, 500),
            });
        }
    };
    const createWorker = (name, handler, options = {}) => {
        metrics.set(name, { completed: 0, failed: 0 });
        const worker = new bullmq_1.Worker(name, handler, {
            ...options,
            connection: redis,
        });
        workers.push(worker);
        worker.on('ready', () => {
            readyWorkers.add(name);
            logger_1.logger.info({ queue: name }, 'Worker ready');
        });
        worker.on('closed', () => readyWorkers.delete(name));
        worker.on('error', (error) => {
            readyWorkers.delete(name);
            logger_1.logger.error({ error, queue: name }, 'Worker error');
        });
        worker.on('completed', () => {
            const metric = metrics.get(name);
            if (metric)
                metric.completed += 1;
        });
        worker.on('failed', async (job, error) => {
            const metric = metrics.get(name);
            if (metric)
                metric.failed += 1;
            await captureJobError(job, error);
        });
        return worker;
    };
    createWorker('fetch-reddit', fetch_reddit_1.redditFetchHandler, {
        limiter: { max: 1, duration: 1_100 },
    });
    createWorker('fetch-bluesky', fetch_bluesky_1.blueskyFetchHandler, {
        limiter: { max: 3, duration: 1_000 },
    });
    createWorker('fetch-x', fetch_x_1.xFetchHandler, {
        limiter: { max: 180, duration: 900_000 },
    });
    createWorker('score-post', score_post_1.scorePostHandler, { concurrency: 10 });
    createWorker('send-reply', send_reply_1.sendReplyHandler, { concurrency: 5 });
    createWorker('send-digest', send_digest_1.sendDigestHandler, { concurrency: 5 });
    createWorker('notify-slack', notify_slack_1.notifySlackHandler, { concurrency: 10 });
    createWorker('check-google-rank', check_google_rank_1.checkGoogleRankHandler, {
        concurrency: 5,
        limiter: { max: 10, duration: 1_000 },
    });
    const heartbeat = process.env.WORKER_HEALTHCHECK_URL
        ? setInterval(() => {
            (0, http_1.fetchWithTimeout)(process.env.WORKER_HEALTHCHECK_URL, {}, 5_000)
                .catch((error) => logger_1.logger.error({ error }, 'Worker heartbeat failed'));
        }, 60_000)
        : undefined;
    heartbeat?.unref();
    const serverAdapter = new express_1.ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    (0, api_1.createBullBoard)({
        queues: queueEntries.map(([, queue]) => new bullMQAdapter_1.BullMQAdapter(queue)),
        serverAdapter,
    });
    const app = (0, express_2.default)();
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret)
        throw new Error('ADMIN_SECRET environment variable is required');
    app.disable('x-powered-by');
    app.get('/healthz', (_request, response) => {
        response
            .status(shuttingDown ? 503 : 200)
            .set('Cache-Control', 'no-store')
            .json({
            status: shuttingDown ? 'stopping' : 'ok',
            service: 'scouto-worker',
            release: release ?? 'development',
        });
    });
    app.get('/readyz', async (_request, response) => {
        let pingOk = false;
        try {
            pingOk = await (0, http_1.withTimeout)(redis.ping(), 3_000, 'worker redis ping') === 'PONG';
        }
        catch {
            pingOk = false;
        }
        const ready = !shuttingDown && redisReady && pingOk && readyWorkers.size === workers.length;
        response
            .status(ready ? 200 : 503)
            .set('Cache-Control', 'no-store')
            .json({
            status: ready ? 'ok' : 'degraded',
            redis: redisReady && pingOk ? 'ok' : 'error',
            workersReady: readyWorkers.size,
            workersExpected: workers.length,
        });
    });
    const requireAdmin = (request, response, next) => {
        if (request.headers.authorization !== `Bearer ${adminSecret}`) {
            response.status(401).send('Unauthorized');
            return;
        }
        next();
    };
    app.get('/metrics', requireAdmin, async (_request, response) => {
        const lines = [
            '# HELP scouto_worker_jobs_total Jobs observed by this worker process.',
            '# TYPE scouto_worker_jobs_total counter',
        ];
        for (const [queue, metric] of metrics) {
            const label = sanitizeMetricLabel(queue);
            lines.push(`scouto_worker_jobs_total{queue="${label}",result="completed"} ${metric.completed}`);
            lines.push(`scouto_worker_jobs_total{queue="${label}",result="failed"} ${metric.failed}`);
        }
        lines.push('# HELP scouto_queue_jobs Current BullMQ job counts.');
        lines.push('# TYPE scouto_queue_jobs gauge');
        for (const [queueName, queue] of queueEntries) {
            const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
            const label = sanitizeMetricLabel(queueName);
            for (const [state, value] of Object.entries(counts)) {
                lines.push(`scouto_queue_jobs{queue="${label}",state="${state}"} ${value}`);
            }
        }
        response.type('text/plain; version=0.0.4').send(`${lines.join('\n')}\n`);
    });
    app.use('/admin/queues', requireAdmin, serverAdapter.getRouter());
    const port = Number(process.env.WORKER_PORT ?? 3001);
    let server;
    await new Promise((resolve) => {
        server = app.listen(port, '0.0.0.0', () => {
            logger_1.logger.info({ port }, 'Worker administration server ready');
            resolve();
        });
    });
    const closeServer = () => new Promise((resolve) => server.close(() => resolve()));
    const shutdown = async (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        logger_1.logger.info({ signal }, 'Graceful worker shutdown started');
        if (heartbeat)
            clearInterval(heartbeat);
        const closeOperation = Promise.allSettled([
            closeServer(),
            ...workers.map((worker) => worker.close()),
            ...queueEntries.map(([, queue]) => queue.close()),
        ]).then(async () => {
            await Promise.allSettled([redis.quit(), redis_1.redis.quit(), Sentry.flush(2_000)]);
        });
        try {
            await (0, http_1.withTimeout)(closeOperation, 25_000, 'worker graceful shutdown');
            logger_1.logger.info('Graceful worker shutdown complete');
            process.exitCode = 0;
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Graceful worker shutdown timed out');
            process.exitCode = 1;
        }
    };
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
    logger_1.logger.info({ workers: workers.length }, 'Scouto workers initialized');
    return { app, workers, shutdown };
}
