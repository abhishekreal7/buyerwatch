"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAiSettlementMessage = isAiSettlementMessage;
exports.applyAiSettlement = applyAiSettlement;
exports.settleAiUsageDurably = settleAiUsageDurably;
exports.releaseAiSpendDurably = releaseAiSpendDurably;
exports.releaseMonthlyDraftDurably = releaseMonthlyDraftDurably;
const logger_1 = require("./logger");
const qstash_1 = require("./qstash");
function isAiSettlementMessage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const message = value;
    if (typeof message.id !== 'string'
        || message.id.length < 8
        || message.id.length > 200
        || typeof message.reservationId !== 'string'
        || typeof message.userId !== 'string'
        || !['record_usage', 'release_spend', 'release_draft_allowance'].includes(String(message.operation)))
        return false;
    if (message.operation !== 'record_usage')
        return true;
    if (!message.usage || typeof message.usage !== 'object' || Array.isArray(message.usage))
        return false;
    const usage = message.usage;
    return typeof usage.model === 'string'
        && usage.model.length <= 200
        && [usage.inputTokens, usage.outputTokens, usage.estimatedCostMicrousd]
            .every(number => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0);
}
async function applyAiSettlement(client, message) {
    const usage = message.operation === 'record_usage'
        ? message.usage
        : { model: '', inputTokens: 0, outputTokens: 0, estimatedCostMicrousd: 0 };
    const { data, error } = await client.rpc('apply_ai_settlement_v1', {
        p_id: message.id,
        p_operation: message.operation,
        p_reservation_id: message.reservationId,
        p_user_id: message.userId,
        p_model: usage.model,
        p_input_tokens: usage.inputTokens,
        p_output_tokens: usage.outputTokens,
        p_cost_microusd: usage.estimatedCostMicrousd,
    });
    if (error)
        throw new Error(`AI settlement failed: ${error.message}`);
    if (data !== true)
        throw new Error('AI settlement was not applied');
}
async function applyOrQueue(client, message) {
    try {
        await applyAiSettlement(client, message);
        return 'applied';
    }
    catch (directError) {
        try {
            const messageId = await (0, qstash_1.publishQStashJson)('/api/jobs/ai-settlement', message, {
                retries: 6,
                timeout: '2m',
            });
            if (!messageId)
                throw new Error('QStash is not configured');
            logger_1.logger.warn({ directError, settlementId: message.id, messageId, operation: message.operation }, 'AI settlement deferred to durable retry');
            return 'queued';
        }
        catch (queueError) {
            logger_1.logger.error({ directError, queueError, settlementId: message.id, operation: message.operation }, 'AI settlement could not be applied or queued; reservation remains pending');
            throw queueError;
        }
    }
}
function settleAiUsageDurably(client, input) {
    return applyOrQueue(client, {
        id: `ai-usage:${input.reservationId}`,
        operation: 'record_usage',
        reservationId: input.reservationId,
        userId: input.userId,
        usage: input.usage,
    });
}
function releaseAiSpendDurably(client, input) {
    return applyOrQueue(client, {
        id: `ai-release:${input.reservationId}`,
        operation: 'release_spend',
        reservationId: input.reservationId,
        userId: input.userId,
    });
}
function releaseMonthlyDraftDurably(client, input) {
    return applyOrQueue(client, {
        id: `draft-release:${input.reservationId}`,
        operation: 'release_draft_allowance',
        reservationId: input.reservationId,
        userId: input.userId,
    });
}
