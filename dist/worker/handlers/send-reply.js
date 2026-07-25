"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReplyHandler = sendReplyHandler;
const logger_1 = require("../../src/lib/logger");
const reddit_post_1 = require("../../src/lib/reddit-post");
const bluesky_post_1 = require("../../src/lib/bluesky-post");
const send_limiter_1 = require("../../src/lib/send-limiter");
const supabase_1 = require("../lib/supabase");
async function requireNoError(operation, context) {
    const { error } = await operation;
    if (error)
        throw new Error(`${context}: ${error.message}`);
}
async function sendReplyHandler(job) {
    const { userId, threadExternalId, threadId, text, platform, triggerType } = job.data;
    const reservation = await (0, send_limiter_1.reserveSendSlot)(userId, platform);
    if ('reason' in reservation) {
        throw new reddit_post_1.PlatformPostError(platform, `Rate limited until ${new Date(reservation.reset).toISOString()}: ${reservation.reason}`, true);
    }
    const { data: claimed, error: claimError } = await supabase_1.supabaseWorker.rpc('claim_thread_for_send', {
        p_thread_id: threadId,
        p_user_id: userId,
    });
    if (claimError) {
        await (0, send_limiter_1.releaseSendSlot)(userId, platform, reservation.token).catch(() => undefined);
        throw new Error(`Unable to claim reply: ${claimError.message}`);
    }
    if (!claimed) {
        await (0, send_limiter_1.releaseSendSlot)(userId, platform, reservation.token).catch(() => undefined);
        logger_1.logger.info({ jobId: job.id, threadId }, 'Reply already sent or no longer sendable');
        return { duplicate: true };
    }
    let externalSendSucceeded = false;
    let externalPermalink = null;
    try {
        const result = platform === 'reddit'
            ? await (0, reddit_post_1.postRedditReply)(userId, threadExternalId, text)
            : await (0, bluesky_post_1.postBlueskyReply)(userId, threadExternalId, text);
        externalSendSucceeded = true;
        externalPermalink = result.permalink;
        await (0, send_limiter_1.recordSuccessfulSend)(userId, platform, reservation.token);
        await requireNoError(supabase_1.supabaseWorker.from('monitored_threads').update({ status: 'replied' }).eq('id', threadId).eq('user_id', userId), 'Unable to mark thread replied');
        await requireNoError(supabase_1.supabaseWorker.from('reply_analytics').update({
            was_sent: true,
            sent_at: new Date().toISOString(),
        }).eq('thread_id', threadId).eq('user_id', userId), 'Unable to update reply analytics');
        await requireNoError(supabase_1.supabaseWorker.from('send_audit_log').insert({
            user_id: userId,
            thread_id: threadId,
            platform,
            trigger_type: triggerType,
            status: 'success',
            permalink: result.permalink,
        }), 'Unable to write send audit');
        const { data: threadRow, error: threadError } = await supabase_1.supabaseWorker
            .from('monitored_threads')
            .select('tracking_sid')
            .eq('id', threadId)
            .eq('user_id', userId)
            .single();
        if (threadError)
            throw new Error(`Unable to load tracking state: ${threadError.message}`);
        if (threadRow.tracking_sid) {
            const { data: profile, error: profileError } = await supabase_1.supabaseWorker
                .from('profiles')
                .select('business_url')
                .eq('id', userId)
                .single();
            if (profileError)
                throw new Error(`Unable to load attribution destination: ${profileError.message}`);
            const destinationUrl = profile.business_url
                ? `${profile.business_url.replace(/\/$/, '')}?ref=scouto&sid=${threadRow.tracking_sid}`
                : null;
            await requireNoError(supabase_1.supabaseWorker.from('reply_attribution').upsert({
                user_id: userId,
                thread_id: threadId,
                attribution_token: threadRow.tracking_sid,
                shortcode: threadRow.tracking_sid,
                destination_url: destinationUrl,
            }, { onConflict: 'attribution_token' }), 'Unable to persist reply attribution');
        }
        return { success: true, permalink: result.permalink };
    }
    catch (error) {
        if (externalSendSucceeded) {
            // The provider accepted the reply. Never make it sendable again: doing so
            // could create a duplicate public post if a persistence call failed.
            await (0, send_limiter_1.recordSuccessfulSend)(userId, platform, reservation.token).catch(() => undefined);
            await supabase_1.supabaseWorker
                .from('monitored_threads')
                .update({ status: 'send_reconciliation_required' })
                .eq('id', threadId)
                .eq('user_id', userId);
            await supabase_1.supabaseWorker.from('send_audit_log').insert({
                user_id: userId,
                thread_id: threadId,
                platform,
                trigger_type: triggerType,
                status: 'reconciliation_required',
                permalink: externalPermalink,
                error_message: error instanceof Error ? error.message.slice(0, 500) : 'Post-send persistence error',
            });
            throw error;
        }
        await (0, send_limiter_1.releaseSendSlot)(userId, platform, reservation.token).catch(() => undefined);
        const isRetryable = error instanceof reddit_post_1.PlatformPostError && error.retryable;
        const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
        const finalAttempt = !isRetryable || job.attemptsMade + 1 >= attempts;
        // Release the DB claim before BullMQ retries. A concurrently delivered
        // duplicate still cannot claim while this attempt owns `sending`.
        await requireNoError(supabase_1.supabaseWorker
            .from('monitored_threads')
            .update({ status: 'drafted' })
            .eq('id', threadId)
            .eq('user_id', userId)
            .eq('status', 'sending'), 'Unable to release failed send claim');
        if (finalAttempt) {
            await supabase_1.supabaseWorker.from('send_audit_log').insert({
                user_id: userId,
                thread_id: threadId,
                platform,
                trigger_type: triggerType,
                status: isRetryable ? 'failed_retryable' : 'failed_permanent',
                error_message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown send error',
            });
        }
        throw error;
    }
}
