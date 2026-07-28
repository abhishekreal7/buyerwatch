"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDigestHandler = sendDigestHandler;
const resend_1 = require("resend");
const WeeklyDigest_1 = require("../../src/emails/WeeklyDigest");
const logger_1 = require("../../src/lib/logger");
const supabase_js_1 = require("@supabase/supabase-js");
const http_1 = require("../../src/lib/http");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function sendDigestHandler(job) {
    const { userId, email, items, unsubscribeUrl } = job.data;
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
        logger_1.logger.info('Digest skipped: email provider is not configured');
        return { success: true, reason: 'email disabled' };
    }
    const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
    if (!email) {
        logger_1.logger.warn({ userId }, 'Digest skipped: no email provided');
        return { success: false, reason: 'no email' };
    }
    if (!items || items.length === 0) {
        logger_1.logger.info({ userId }, 'Digest skipped: no items to send');
        return { success: true, reason: 'no items' };
    }
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString();
        const [{ count: threadsCount }, { count: draftsCount }, { count: sentCount }] = await Promise.all([
            supabase.from('monitored_threads').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sevenDaysAgoStr),
            supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sevenDaysAgoStr).not('draft_text', 'is', null),
            supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sevenDaysAgoStr).eq('was_sent', true)
        ]);
        const data = await (0, http_1.withTimeout)(resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL,
            to: [email],
            subject: `BuyerWatch found ${threadsCount || items.length} opportunities for you this week`,
            react: (0, WeeklyDigest_1.WeeklyDigest)({
                opportunities: items,
                totalFound: threadsCount || items.length,
                totalDrafts: draftsCount || 0,
                totalReplies: sentCount || 0,
                dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
                unsubscribeUrl,
            }),
            headers: unsubscribeUrl ? {
                'List-Unsubscribe': `<${unsubscribeUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            } : undefined,
        }), 15_000, 'digest email delivery');
        logger_1.logger.info({ userId, messageId: data?.data?.id }, 'Digest sent successfully');
        return { success: true, messageId: data?.data?.id };
    }
    catch (error) {
        logger_1.logger.error({ error, userId }, 'Failed to send digest email');
        throw error;
    }
}
