"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyRedditDeliveryAlerts = classifyRedditDeliveryAlerts;
exports.sendRedditDeliveryAlert = sendRedditDeliveryAlert;
exports.alertRedditDeliveryFailure = alertRedditDeliveryFailure;
const resend_1 = require("resend");
const supabase_js_1 = require("@supabase/supabase-js");
const encryption_1 = require("./encryption");
const http_1 = require("./http");
const logger_1 = require("./logger");
const redis_1 = require("./redis");
const outbound_url_1 = require("./security/outbound-url");
const plan_limits_1 = require("./plan-limits");
const reddit_service_safety_1 = require("./reddit-service-safety");
const incident_email_1 = require("./incident-email");
function classifyRedditDeliveryAlerts(input) {
    const kinds = new Set();
    if (input.reauthRequired)
        kinds.add('reconnect_required');
    if (input.deliveryUncertain)
        kinds.add('delivery_uncertain');
    if (input.code === 'hyperbrowser_credits_exhausted')
        kinds.add('credits_low');
    if (input.code.startsWith('reddit_comment_')
        || input.code === 'reddit_post_snapshot_invalid'
        || input.code === 'reddit_account_safety_profile_unavailable')
        kinds.add('selector_changed');
    if ((input.consecutiveFailures ?? 0) >= 3)
        kinds.add('repeated_failures');
    return [...kinds];
}
function adminRecipients() {
    return [...new Set((process.env.ADMIN_EMAILS ?? '')
            .split(',')
            .map(value => value.trim().toLowerCase())
            .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))]
        .slice(0, 5);
}
function alertCopy(kind, code) {
    if (kind === 'repeated_failures' && code === 'reply_not_sent') {
        return {
            title: 'Reply was not sent',
            action: 'Nothing was posted. Review the draft before trying again.',
            detail: `Operational code: ${code.slice(0, 160)}`,
        };
    }
    const copy = {
        reconnect_required: {
            title: 'Reddit connection needs attention',
            action: 'Reconnect Reddit in BuyerWatch Settings before sending another reply.',
        },
        selector_changed: {
            title: 'Reddit delivery UI changed',
            action: 'Automatic delivery was stopped safely. Review the Hyperbrowser selectors before retrying.',
        },
        delivery_uncertain: {
            title: 'Reddit delivery outcome is uncertain',
            action: 'Check the Reddit thread manually before retrying so a duplicate is not posted.',
        },
        repeated_failures: {
            title: 'Reddit delivery failed repeatedly',
            action: 'Inspect the connection and recent delivery logs before the next attempt.',
        },
        credits_low: {
            title: 'Reddit provider credits are low',
            action: 'Top up the affected Reddit provider before delivery capacity is exhausted.',
        },
        canary_failed: {
            title: 'Reddit connection canary failed',
            action: 'Inspect the saved Reddit session and Hyperbrowser availability.',
        },
    };
    return {
        ...copy[kind],
        detail: `Operational code: ${code.slice(0, 160)}`,
    };
}
async function configuredSlackWebhook(userId) {
    if (!userId)
        return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
        throw new Error('Server database configuration is missing');
    const admin = (0, supabase_js_1.createClient)(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin
        .from('profiles')
        .select('plan, slack_webhook_ciphertext, slack_webhook_url')
        .eq('id', userId)
        .maybeSingle();
    if (error)
        throw error;
    if (!(0, plan_limits_1.getPlanLimits)(data?.plan).slackNotifications)
        return null;
    const webhook = data?.slack_webhook_ciphertext
        ? (0, encryption_1.decrypt)(data.slack_webhook_ciphertext)
        : data?.slack_webhook_url ?? '';
    return webhook && (0, outbound_url_1.isAllowedSlackWebhookUrl)(webhook) ? webhook : null;
}
async function sendRedditDeliveryAlert(input) {
    try {
        await (0, reddit_service_safety_1.createIncidentForRedditAlert)(input);
        await (0, incident_email_1.deliverPendingIncidentEmails)(20);
    }
    catch (error) {
        logger_1.logger.error({ error, kind: input.kind, code: input.code }, 'Unable to persist or deliver customer incident');
    }
    const subject = input.userId ?? 'system';
    const dedupeKey = `alert:reddit-delivery:${input.kind}:${subject}:${input.code.slice(0, 80)}`;
    let reserved = false;
    try {
        reserved = await redis_1.redis.set(dedupeKey, '1', 'EX', 6 * 60 * 60, 'NX') === 'OK';
        if (!reserved)
            return false;
    }
    catch (error) {
        logger_1.logger.warn({ error, kind: input.kind }, 'Reddit alert deduplication unavailable');
    }
    const copy = alertCopy(input.kind, input.code);
    const deliveries = [];
    try {
        // Provider-credit warnings are internal operational alerts. A user's
        // optional Slack connection must not receive them.
        const webhook = input.kind === 'credits_low'
            ? null
            : await configuredSlackWebhook(input.userId);
        if (webhook) {
            deliveries.push((0, http_1.fetchWithTimeout)(webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `BuyerWatch: ${copy.title}`,
                    blocks: [{
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `*${copy.title}*\n${copy.action}\n${copy.detail}`,
                            },
                        }],
                }),
            }, 8_000).then(response => {
                if (!response.ok)
                    throw new Error(`Slack returned ${response.status}`);
            }));
        }
    }
    catch (error) {
        logger_1.logger.error({ error, kind: input.kind }, 'Unable to prepare Reddit Slack alert');
    }
    const recipients = adminRecipients();
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM_EMAIL?.trim();
    if (apiKey && from && recipients.length > 0) {
        deliveries.push((0, http_1.withTimeout)(new resend_1.Resend(apiKey).emails.send({
            from,
            to: recipients,
            subject: `BuyerWatch: ${copy.title}`,
            text: [
                copy.title,
                copy.action,
                copy.detail,
                ...(input.detail ? [input.detail.slice(0, 500)] : []),
            ].join('\n'),
        }), 10_000, 'Reddit delivery email alert'));
    }
    if (deliveries.length === 0) {
        logger_1.logger.warn({ kind: input.kind, code: input.code }, 'No Reddit alert channel is configured');
        if (reserved)
            await redis_1.redis.del(dedupeKey).catch(() => undefined);
        return false;
    }
    const results = await Promise.allSettled(deliveries);
    const delivered = results.some(result => result.status === 'fulfilled');
    if (!delivered && reserved)
        await redis_1.redis.del(dedupeKey).catch(() => undefined);
    if (!delivered) {
        logger_1.logger.error({ kind: input.kind, code: input.code }, 'All Reddit alert deliveries failed');
    }
    return delivered;
}
async function alertRedditDeliveryFailure(input) {
    const kinds = classifyRedditDeliveryAlerts(input);
    await Promise.allSettled(kinds.map(kind => sendRedditDeliveryAlert({
        kind,
        code: input.code,
        userId: input.userId,
        ...(input.consecutiveFailures !== undefined
            ? { detail: `Consecutive failures: ${input.consecutiveFailures}` }
            : {}),
    })));
}
