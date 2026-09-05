"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReplyHandler = sendReplyHandler;
const send_reply_1 = require("../../src/lib/send-reply");
async function sendReplyHandler(job) {
    const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
    return (0, send_reply_1.processSendReply)(job.data, {
        attempt: job.attemptsMade + 1,
        maxAttempts: attempts,
        jobId: job.id,
        discard: () => job.discard(),
    });
}
