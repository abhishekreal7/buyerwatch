"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverPendingIncidentEmails = deliverPendingIncidentEmails;
const resend_1 = require("resend");
const supabase_js_1 = require("@supabase/supabase-js");
const http_1 = require("./http");
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
function appOrigin() {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
    return configured ? configured.replace(/\/$/, '') : 'https://buyerwatch.co';
}
async function deliverPendingIncidentEmails(limit = 20) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM_EMAIL?.trim();
    if (!apiKey || !from) {
        logger_1.logger.error('Customer incident email is not configured');
        return { claimed: 0, delivered: 0, failed: 0 };
    }
    const admin = getServiceRoleClient();
    const claim = await admin.rpc('claim_incident_email_deliveries_v1', {
        p_limit: Math.max(1, Math.min(limit, 50)),
    });
    if (claim.error)
        throw claim.error;
    const deliveries = (claim.data ?? []);
    if (deliveries.length === 0)
        return { claimed: 0, delivered: 0, failed: 0 };
    const { data: incidentRows, error: incidentsError } = await admin
        .from('service_incidents')
        .select('id, title, message, severity, action_path')
        .in('id', deliveries.map(delivery => delivery.incident_id));
    if (incidentsError)
        throw incidentsError;
    const incidents = new Map(incidentRows.map(incident => [incident.id, incident]));
    const resend = new resend_1.Resend(apiKey);
    let delivered = 0;
    let failed = 0;
    await Promise.all(deliveries.map(async (delivery) => {
        const incident = incidents.get(delivery.incident_id);
        let succeeded = false;
        let failure = 'incident_unavailable';
        try {
            if (!incident)
                throw new Error(failure);
            const user = await admin.auth.admin.getUserById(delivery.user_id);
            if (user.error || !user.data.user?.email)
                throw new Error('recipient_unavailable');
            const actionUrl = `${appOrigin()}${incident.action_path ?? '/status'}`;
            const result = await (0, http_1.withTimeout)(resend.emails.send({
                from,
                to: user.data.user.email,
                subject: `BuyerWatch: ${incident.title}`,
                text: `${incident.title}\n\n${incident.message}\n\nView details: ${actionUrl}\nService status: ${appOrigin()}/status\nSupport: support@buyerwatch.co`,
            }), 10_000, 'Customer incident email');
            if (result.error)
                throw new Error('email_provider_rejected');
            succeeded = true;
            delivered += 1;
        }
        catch (error) {
            failed += 1;
            failure = error instanceof Error ? error.message.slice(0, 300) : 'delivery_failed';
            logger_1.logger.error({ error, incidentId: delivery.incident_id }, 'Customer incident email failed');
        }
        const recorded = await admin.rpc('record_incident_email_delivery_v1', {
            p_delivery_id: delivery.delivery_id,
            p_succeeded: succeeded,
            p_error: succeeded ? null : failure,
        });
        if (recorded.error)
            logger_1.logger.error({ error: recorded.error }, 'Unable to record incident email result');
    }));
    return { claimed: deliveries.length, delivered, failed };
}
