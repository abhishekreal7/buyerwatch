"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDigestHandler = sendDigestHandler;
const resend_1 = require("resend");
const WeeklyDigest_1 = require("../../src/emails/WeeklyDigest");
const logger_1 = require("../../src/lib/logger");
const supabase_js_1 = require("@supabase/supabase-js");
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function sendDigestHandler(job) {
    const { userId, email, items } = job.data;
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
        const data = await resend.emails.send({
            from: 'Scouto <hello@scouto.com>',
            to: [email],
            subject: `Scouto found ${threadsCount || items.length} opportunities for you this week`,
            react: (0, WeeklyDigest_1.WeeklyDigest)({
                opportunities: items,
                totalFound: threadsCount || items.length,
                totalDrafts: draftsCount || 0,
                totalReplies: sentCount || 0,
                dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
            })
        });
        logger_1.logger.info({ userId, messageId: data?.data?.id }, 'Digest sent successfully');
        return { success: true, messageId: data?.data?.id };
    }
    catch (error) {
        logger_1.logger.error({ error, userId }, 'Failed to send digest email');
        throw error;
    }
}
