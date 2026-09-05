"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRedisLock = void 0;
exports.dispatchPendingOutbox = dispatchPendingOutbox;
exports.recoverStaleSends = recoverStaleSends;
exports.cleanupOperationalData = cleanupOperationalData;
exports.reconcileBillingSubscriptions = reconcileBillingSubscriptions;
const dodopayments_1 = __importDefault(require("dodopayments"));
const supabase_js_1 = require("@supabase/supabase-js");
const logger_1 = require("./logger");
const qstash_1 = require("./qstash");
const reddit_delivery_concurrency_1 = require("./reddit-delivery-concurrency");
const dodo_1 = require("./dodo");
var redis_lock_1 = require("./redis-lock");
Object.defineProperty(exports, "withRedisLock", { enumerable: true, get: function () { return redis_lock_1.withRedisLock; } });
function getSupabaseAdmin() {
    return (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function dispatchPendingOutbox(limit = 100, threadId) {
    const supabase = getSupabaseAdmin();
    let query = supabase
        .from('job_outbox')
        .select('id, thread_id, payload, attempts')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);
    if (threadId)
        query = query.eq('thread_id', threadId);
    const { data, error } = await query;
    if (error)
        throw error;
    let dispatched = 0;
    for (const entry of data ?? []) {
        const payload = entry.payload;
        try {
            const messageId = await (0, qstash_1.publishQStashJson)('/api/jobs/send', payload, {
                retries: 4,
                timeout: '4m',
                flowControl: (0, reddit_delivery_concurrency_1.getRedditDeliveryFlowControl)(payload.platform),
            });
            if (!messageId)
                throw new Error('QStash reply delivery is not configured');
            const { error: updateError } = await supabase
                .from('job_outbox')
                .update({
                status: 'dispatched',
                dispatched_at: new Date().toISOString(),
                qstash_message_id: messageId,
                completed_at: null,
                permalink: null,
                attempts: entry.attempts + 1,
                last_error: null,
            })
                .eq('id', entry.id)
                .eq('status', 'pending');
            if (updateError)
                throw updateError;
            dispatched += 1;
        }
        catch (error) {
            await supabase
                .from('job_outbox')
                .update({
                attempts: entry.attempts + 1,
                last_error: error instanceof Error
                    ? error.message.slice(0, 500)
                    : 'Unknown outbox dispatch failure',
            })
                .eq('id', entry.id);
            throw error;
        }
    }
    return dispatched;
}
async function recoverStaleSends(now = new Date()) {
    const supabase = getSupabaseAdmin();
    const staleBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
    const { data: recoveredClaims, error: claimsError } = await supabase.rpc('recover_stale_send_claims', {
        p_stale_before: staleBefore,
    });
    if (claimsError)
        throw claimsError;
    const staleOutboxBefore = new Date(now.getTime() - 20 * 60_000).toISOString();
    const { data: requeuedOutbox, error: outboxError } = await supabase.rpc('requeue_stale_auto_send_outbox', {
        p_stale_before: staleOutboxBefore,
        p_max_dispatch_attempts: 3,
    });
    if (outboxError)
        throw outboxError;
    return Number(recoveredClaims ?? 0) + Number(requeuedOutbox ?? 0);
}
async function cleanupOperationalData() {
    const { data, error } = await getSupabaseAdmin().rpc('cleanup_operational_data');
    if (error)
        throw error;
    return (data ?? {});
}
async function reconcileBillingSubscriptions(limit = 100) {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey
        || !process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
        || !process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID) {
        return 0;
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('profiles')
        .select('id, billing_subscription_id')
        .not('billing_subscription_id', 'is', null)
        .order('billing_updated_at', { ascending: true, nullsFirst: true })
        .limit(limit);
    if (error)
        throw error;
    const dodo = new dodopayments_1.default({
        bearerToken: apiKey,
        environment: (0, dodo_1.getDodoEnvironment)(),
        timeout: 15_000,
        maxRetries: 2,
    });
    let reconciled = 0;
    for (const profile of data ?? []) {
        if (!profile.billing_subscription_id)
            continue;
        try {
            const subscription = await dodo.subscriptions.retrieve(profile.billing_subscription_id);
            const plan = (0, dodo_1.getDodoPlanFromProductId)(subscription.product_id);
            if (!plan) {
                logger_1.logger.error({ subscriptionId: subscription.subscription_id }, 'Billing reconciliation found an unknown product');
                continue;
            }
            const eventAt = new Date().toISOString();
            const reconciliationBucket = Math.floor(Date.now() / (6 * 60 * 60_000));
            const eventId = [
                'reconcile',
                subscription.subscription_id,
                reconciliationBucket,
                subscription.status,
                subscription.product_id,
                subscription.next_billing_date,
            ].join(':');
            const { error: applyError } = await supabase.rpc('apply_billing_subscription_event_v2', {
                p_event_id: eventId,
                p_event_type: 'subscription.reconciled',
                p_user_id: profile.id,
                p_subscription_id: subscription.subscription_id,
                p_customer_id: subscription.customer.customer_id,
                p_plan: plan,
                p_provider_status: subscription.status,
                p_product_id: subscription.product_id,
                p_period_ends_at: subscription.next_billing_date,
                p_event_at: eventAt,
            });
            if (applyError)
                throw applyError;
            reconciled += 1;
        }
        catch (error) {
            logger_1.logger.error({ error, subscriptionId: profile.billing_subscription_id }, 'Billing reconciliation failed');
        }
    }
    return reconciled;
}
