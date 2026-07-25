"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deadLetterQueue = exports.sendReplyQueue = exports.checkGoogleRankQueue = exports.notifySlackQueue = exports.sendDigestQueue = exports.scorePostQueue = exports.xFetchQueue = exports.blueskyFetchQueue = exports.redditFetchQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../redis");
const reliableDefaults = {
    attempts: 4,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 1_000,
    removeOnFail: 2_000,
};
function queue(name, defaults = reliableDefaults) {
    let instance;
    const getInstance = () => {
        instance ??= new bullmq_1.Queue(name, {
            connection: redis_1.redis,
            defaultJobOptions: defaults,
        });
        return instance;
    };
    // Route modules are evaluated during `next build`. Defer BullMQ construction
    // until a handler or the standalone worker actually touches the queue, so a
    // production build never attempts an outbound Redis connection.
    return new Proxy({}, {
        get(_target, property) {
            const value = Reflect.get(getInstance(), property, getInstance());
            return typeof value === 'function' ? value.bind(getInstance()) : value;
        },
    });
}
exports.redditFetchQueue = queue('fetch-reddit');
exports.blueskyFetchQueue = queue('fetch-bluesky');
exports.xFetchQueue = queue('fetch-x');
exports.scorePostQueue = queue('score-post');
exports.sendDigestQueue = queue('send-digest');
exports.notifySlackQueue = queue('notify-slack');
exports.checkGoogleRankQueue = queue('check-google-rank');
exports.sendReplyQueue = queue('send-reply', {
    attempts: 5,
    backoff: { type: 'fixed', delay: 5 * 60_000 },
    removeOnComplete: 2_000,
    removeOnFail: 2_000,
});
exports.deadLetterQueue = queue('dead-letter', {
    attempts: 1,
    removeOnComplete: 5_000,
    removeOnFail: 5_000,
});
