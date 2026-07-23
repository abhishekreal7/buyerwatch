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
            const delayMs = rateLimitCheck.reset ? Math.max(rateLimitCheck.reset - Date.now(), 10000) : 60000;
            logger_1.logger.info({ jobId: job.id, platform, delayMs, reason: rateLimitCheck.reason }, 'Rate limit exceeded, will retry after delay');
            // Throw a retriable PlatformPostError so BullMQ handles the retry with backoff
            // and the job appears in the "delayed" or "waiting" state — not "completed".
            // The error handler below treats retriable=true as non-permanent and skips the
            // failure audit log, so there is no false alarm at this stage.
            const retryErr = new reddit_post_1.PlatformPostError(platform, `Rate limited: ${rateLimitCheck.reason}`, true);
            throw retryErr;
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
