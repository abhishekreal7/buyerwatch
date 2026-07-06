"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReplyHandler = sendReplyHandler;
const logger_1 = require("../../src/lib/logger");
const supabase_js_1 = require("@supabase/supabase-js");
const reddit_post_1 = require("../../src/lib/reddit-post");
const bluesky_post_1 = require("../../src/lib/bluesky-post");
const send_limiter_1 = require("../../src/lib/send-limiter");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function sendReplyHandler(job) {
    const { userId, threadExternalId, threadId, text, platform, triggerType } = job.data;
    logger_1.logger.info({ jobId: job.id, platform, userId, triggerType }, 'Processing send reply job');
    try {
        // 1. Enforce rate limits
        const rateLimitCheck = await (0, send_limiter_1.checkSendRateLimit)(userId, platform);
        if (!rateLimitCheck.allowed) {
            const { sendReplyQueue } = await import('../../src/lib/queues/index.js');
            const delayMs = rateLimitCheck.reset ? Math.max(rateLimitCheck.reset - Date.now(), 10000) : 60000;
            logger_1.logger.info({ jobId: job.id, platform, delayMs }, 'Rate limit exceeded, re-queuing with delay');
            await sendReplyQueue.add(job.name, job.data, { delay: delayMs });
            return; // Gracefully exit without failing, as we have re-queued it
        }
        // 2. Dispatch to platform
        let permalink = null;
        if (platform === 'reddit') {
            const result = await (0, reddit_post_1.postRedditReply)(userId, threadExternalId, text);
            permalink = result.permalink;
        }
        else if (platform === 'bluesky') {
            const result = await (0, bluesky_post_1.postBlueskyReply)(userId, threadExternalId, text);
            permalink = result.permalink;
        }
        else {
            throw new Error(`Platform ${platform} sending not implemented yet`);
        }
        // 3. Success state
        await supabase.from('monitored_threads')
            .update({ status: 'replied' })
            .eq('id', threadId);
        await supabase.from('reply_analytics')
            .update({ was_sent: true, sent_at: new Date().toISOString() })
            .eq('thread_id', threadId);
        await supabase.from('send_audit_log').insert({
            user_id: userId,
            thread_id: threadId,
            platform,
            trigger_type: triggerType,
            status: 'success',
            permalink
        });
        logger_1.logger.info({ jobId: job.id, permalink }, 'Successfully sent reply');
    }
    catch (error) {
        const isRetryable = error instanceof reddit_post_1.PlatformPostError ? error.retryable : false;
        const status = isRetryable ? 'failed_retryable' : 'failed_permanent';
        const errorMessage = error.message || error.toString();
        logger_1.logger.error({ err: error, jobId: job.id, platform, isRetryable }, 'Failed to send reply');
        // Only log permanent failures in audit log, or final attempt?
        // Let's log it if it's the last attempt or permanent
        if (!isRetryable || job.attemptsMade === job.opts.attempts) {
            await supabase.from('send_audit_log').insert({
                user_id: userId,
                thread_id: threadId,
                platform,
                trigger_type: triggerType,
                status,
                error_message: errorMessage
            });
        }
        throw error; // Re-throw for BullMQ to handle retry
    }
}
