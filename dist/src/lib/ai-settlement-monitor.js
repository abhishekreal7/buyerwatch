"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportStaleAiSettlements = reportStaleAiSettlements;
const admin_1 = require("./admin");
const logger_1 = require("./logger");
async function reportStaleAiSettlements(limit = 50) {
    const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data, error } = await (0, admin_1.getServiceRoleClient)()
        .from('ai_spend_reservations')
        .select('id, purpose, created_at')
        .eq('status', 'pending')
        .lt('created_at', staleBefore)
        .order('created_at', { ascending: true })
        .limit(Math.max(1, Math.min(limit, 100)));
    if (error)
        throw error;
    if ((data?.length ?? 0) > 0) {
        logger_1.logger.error({
            staleReservationCount: data.length,
            oldestCreatedAt: data[0]?.created_at,
            purposes: [...new Set(data.map(row => row.purpose))],
        }, 'Stale AI spend reservations require reconciliation');
    }
    return data?.length ?? 0;
}
