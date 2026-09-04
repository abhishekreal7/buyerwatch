"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedditDeliveryCircuitOpenError = void 0;
exports.getRedditDeliveryControl = getRedditDeliveryControl;
exports.assertRedditDeliveryCircuitClosed = assertRedditDeliveryCircuitClosed;
exports.createIncidentForRedditAlert = createIncidentForRedditAlert;
exports.closeTransientRedditCircuitAfterCanary = closeTransientRedditCircuitAfterCanary;
exports.resolveReplyNotSentIncident = resolveReplyNotSentIncident;
exports.resolveRedditUserIncidents = resolveRedditUserIncidents;
const supabase_js_1 = require("@supabase/supabase-js");
const logger_1 = require("./logger");
function getServiceRoleClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
        throw new Error('Server database configuration is missing');
    return (0, supabase_js_1.createClient)(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
class RedditDeliveryCircuitOpenError extends Error {
    code = 'reddit_delivery_paused';
    constructor() {
        super('Reddit delivery is temporarily paused for safety.');
        this.name = 'RedditDeliveryCircuitOpenError';
    }
}
exports.RedditDeliveryCircuitOpenError = RedditDeliveryCircuitOpenError;
async function getRedditDeliveryControl() {
    const { data, error } = await getServiceRoleClient()
        .from('service_controls')
        .select('state, reason_code, requires_manual_reset, opened_at, last_verified_at, updated_at')
        .eq('control_key', 'reddit_delivery')
        .single();
    if (error || !data) {
        logger_1.logger.error({ error }, 'Unable to read Reddit delivery safety control');
        throw new RedditDeliveryCircuitOpenError();
    }
    return {
        state: data.state === 'closed' ? 'closed' : 'open',
        reasonCode: data.reason_code,
        requiresManualReset: data.requires_manual_reset === true,
        openedAt: data.opened_at,
        lastVerifiedAt: data.last_verified_at,
        updatedAt: data.updated_at,
    };
}
async function assertRedditDeliveryCircuitClosed() {
    const control = await getRedditDeliveryControl();
    if (control.state !== 'closed')
        throw new RedditDeliveryCircuitOpenError();
}
const copy = {
    reconnect_required: {
        severity: 'warning',
        title: 'Your Reddit connection needs attention',
        message: 'We paused Reddit delivery for your account. Reconnect it before trying again; no automatic retry will be made.',
        actionPath: '/settings?section=connections',
    },
    selector_changed: {
        severity: 'critical',
        title: 'Reddit delivery is paused',
        message: 'A Reddit interface change was detected. Delivery is stopped safely while we verify the integration.',
        actionPath: '/status',
    },
    delivery_uncertain: {
        severity: 'critical',
        title: 'A Reddit reply needs verification',
        message: 'We could not confirm whether the reply was published. Check the Reddit thread before retrying to avoid a duplicate.',
        actionPath: '/posted',
    },
    repeated_failures: {
        severity: 'warning',
        title: 'Reddit delivery failed repeatedly',
        message: 'Further automatic attempts are stopped for your account until the connection is healthy.',
        actionPath: '/settings?section=connections',
    },
    credits_low: {
        // This copy is shown only if the provider is actually exhausted and the
        // global circuit has paused delivery. Low-balance warnings remain
        // operator-only below.
        severity: 'critical',
        title: 'Reddit delivery is temporarily paused',
        message: 'Delivery is paused safely while we restore service capacity.',
        actionPath: '/status',
    },
    canary_failed: {
        severity: 'critical',
        title: 'Reddit delivery is temporarily paused',
        message: 'Our independent connection check failed. Delivery is paused until a healthy check succeeds.',
        actionPath: '/status',
    },
};
function customerIncidentCopy(input) {
    if (input.kind === 'repeated_failures' && input.code === 'reply_not_sent') {
        return {
            severity: 'warning',
            title: 'Reply was not sent',
            message: 'Nothing was posted. Review the draft before trying again.',
            actionPath: '/dashboard',
        };
    }
    return copy[input.kind];
}
async function createIncidentForRedditAlert(input) {
    // Provider account balances are BuyerWatch operating costs, not customer
    // incidents. They are delivered to the operator by sendRedditDeliveryAlert
    // but must never create a global record that the dashboard or email queue
    // can expose to every customer.
    const providerIsExhausted = input.code === 'hyperbrowser_credits_exhausted';
    if (input.kind === 'credits_low' && !providerIsExhausted)
        return null;
    const admin = getServiceRoleClient();
    const safe = customerIncidentCopy(input);
    const actionPath = input.actionPath ?? safe.actionPath;
    const isGlobal = input.kind === 'selector_changed'
        || input.kind === 'canary_failed';
    const mustOpenCircuit = input.kind === 'selector_changed'
        || input.kind === 'delivery_uncertain'
        || input.kind === 'canary_failed'
        || providerIsExhausted;
    if (mustOpenCircuit) {
        const { data, error } = await admin.rpc('open_reddit_delivery_circuit_v1', {
            p_reason_code: input.code.slice(0, 160),
            p_title: safe.title,
            p_message: safe.message,
            p_requires_manual_reset: input.kind !== 'canary_failed',
        });
        if (error)
            throw error;
        if (input.userId && input.kind === 'delivery_uncertain') {
            const userIncident = await admin.rpc('create_reddit_user_incident_v1', {
                p_user_id: input.userId,
                p_kind: input.kind,
                p_severity: safe.severity,
                p_reason_code: input.code.slice(0, 160),
                p_title: safe.title,
                p_message: safe.message,
                p_action_path: actionPath,
            });
            if (userIncident.error)
                throw userIncident.error;
        }
        return data;
    }
    const result = isGlobal
        ? await admin.rpc('create_reddit_global_incident_v1', {
            p_kind: input.kind,
            p_severity: safe.severity,
            p_reason_code: input.code.slice(0, 160),
            p_title: safe.title,
            p_message: safe.message,
            p_action_path: actionPath,
        })
        : input.userId
            ? await admin.rpc('create_reddit_user_incident_v1', {
                p_user_id: input.userId,
                p_kind: input.kind,
                p_severity: safe.severity,
                p_reason_code: input.code.slice(0, 160),
                p_title: safe.title,
                p_message: safe.message,
                p_action_path: actionPath,
            })
            : null;
    if (result?.error)
        throw result.error;
    return result?.data ?? null;
}
async function closeTransientRedditCircuitAfterCanary() {
    const control = await getRedditDeliveryControl();
    if (control.state === 'closed' || control.requiresManualReset)
        return false;
    const { data, error } = await getServiceRoleClient().rpc('close_reddit_delivery_circuit_v1', {
        p_manual_override: false,
    });
    if (error)
        throw error;
    return data === true;
}
/** Resolve the one actionable final-delivery warning after a later success. */
async function resolveReplyNotSentIncident(userId) {
    const { error } = await getServiceRoleClient()
        .from('service_incidents')
        .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    })
        .eq('user_id', userId)
        .eq('platform', 'reddit')
        .eq('kind', 'repeated_failures')
        .eq('reason_code', 'reply_not_sent')
        .eq('status', 'open');
    if (error)
        throw error;
}
async function resolveRedditUserIncidents(userId) {
    const { data, error } = await getServiceRoleClient().rpc('resolve_reddit_user_incidents_v1', {
        p_user_id: userId,
    });
    if (error)
        throw error;
    return Number(data) || 0;
}
