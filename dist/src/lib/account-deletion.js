"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAccountDeletion = processAccountDeletion;
const dodopayments_1 = __importDefault(require("dodopayments"));
const admin_1 = require("./admin");
const dodo_1 = require("./dodo");
const logger_1 = require("./logger");
function errorCode(error) {
    if (error && typeof error === 'object' && 'code' in error) {
        return String(error.code ?? 'unknown').slice(0, 100);
    }
    return error instanceof Error ? error.name : 'unknown';
}
async function processAccountDeletion(userId) {
    const admin = (0, admin_1.getServiceRoleClient)();
    const { data, error } = await admin
        .from('account_deletion_requests')
        .select('user_id, subscription_id, status, billing_cancelled_at, attempts')
        .eq('user_id', userId)
        .single();
    if (error)
        throw error;
    const request = data;
    if (request.status === 'completed')
        return 'completed';
    const { error: attemptError } = await admin
        .from('account_deletion_requests')
        .update({
        attempts: request.attempts + 1,
        last_error: null,
        updated_at: new Date().toISOString(),
    })
        .eq('user_id', userId);
    if (attemptError)
        throw attemptError;
    try {
        if (request.subscription_id && !request.billing_cancelled_at) {
            const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
            if (!apiKey)
                throw new Error('billing_cancellation_not_configured');
            const dodo = new dodopayments_1.default({
                bearerToken: apiKey,
                environment: (0, dodo_1.getDodoEnvironment)(),
                timeout: 15_000,
                maxRetries: 2,
            });
            await dodo.subscriptions.update(request.subscription_id, {
                status: 'cancelled',
                cancel_reason: 'cancelled_by_customer',
                cancellation_comment: 'Account deleted by customer',
            });
            const cancelledAt = new Date().toISOString();
            const { error: persistCancellationError } = await admin
                .from('account_deletion_requests')
                .update({
                status: 'billing_cancelled',
                billing_cancelled_at: cancelledAt,
                updated_at: cancelledAt,
            })
                .eq('user_id', userId);
            if (persistCancellationError)
                throw persistCancellationError;
        }
        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        if (deleteError && !/not found/i.test(deleteError.message))
            throw deleteError;
        const completedAt = new Date().toISOString();
        const { error: completeError } = await admin
            .from('account_deletion_requests')
            .update({
            status: 'completed',
            completed_at: completedAt,
            last_error: null,
            updated_at: completedAt,
        })
            .eq('user_id', userId);
        if (completeError)
            throw completeError;
        return 'completed';
    }
    catch (error) {
        const code = errorCode(error);
        await admin
            .from('account_deletion_requests')
            .update({
            status: 'failed',
            last_error: code,
            updated_at: new Date().toISOString(),
        })
            .eq('user_id', userId);
        logger_1.logger.error({ code }, 'Account deletion stage failed and remains retryable');
        throw error;
    }
}
