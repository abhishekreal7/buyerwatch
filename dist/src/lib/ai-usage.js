"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiUsageError = void 0;
exports.emptyAiUsage = emptyAiUsage;
exports.calculateAnthropicUsage = calculateAnthropicUsage;
exports.mergeAiUsage = mergeAiUsage;
exports.getAiUsageFromError = getAiUsageFromError;
exports.getAiErrorTelemetry = getAiErrorTelemetry;
exports.getAiSpendConfig = getAiSpendConfig;
exports.reserveAiSpend = reserveAiSpend;
exports.recordAiUsage = recordAiUsage;
exports.releaseAiSpend = releaseAiSpend;
const plan_limits_1 = require("./plan-limits");
class AiUsageError extends Error {
    usage;
    constructor(message, usage, cause) {
        super(message, { cause });
        this.name = 'AiUsageError';
        this.usage = usage;
    }
}
exports.AiUsageError = AiUsageError;
const EMPTY_AI_USAGE = {
    model: '',
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostMicrousd: 0,
};
const USER_MONTHLY_LIMIT_MICROUSD = {
    free: 1_000_000,
    starter: 1_000_000,
    pro: 10_000_000,
    growth: 40_000_000,
};
const USER_LIMIT_ENV = {
    free: 'ANTHROPIC_FREE_MONTHLY_SPEND_LIMIT_USD',
    starter: 'ANTHROPIC_FREE_MONTHLY_SPEND_LIMIT_USD',
    pro: 'ANTHROPIC_PRO_MONTHLY_SPEND_LIMIT_USD',
    growth: 'ANTHROPIC_GROWTH_MONTHLY_SPEND_LIMIT_USD',
};
const DEFAULT_RESERVATION_MICROUSD = {
    intent: 25_000,
    draft: 35_000,
};
function parsePositiveUsd(value, fallbackUsd) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.round(parsed * 1_000_000)
        : fallbackUsd * 1_000_000;
}
function ratesForModel(model) {
    if (model.includes('fable') || model.includes('mythos')) {
        return { input: 10, output: 50 };
    }
    if (model.includes('opus')) {
        return { input: 5, output: 25 };
    }
    if (model.includes('haiku')) {
        return { input: 1, output: 5 };
    }
    return { input: 3, output: 15 };
}
function emptyAiUsage() {
    return { ...EMPTY_AI_USAGE };
}
function calculateAnthropicUsage(model, usage) {
    const inputTokens = usage.input_tokens
        + (usage.cache_creation_input_tokens ?? 0)
        + (usage.cache_read_input_tokens ?? 0);
    const outputTokens = usage.output_tokens;
    const rates = ratesForModel(model);
    return {
        model,
        inputTokens,
        outputTokens,
        // USD-per-million-token rates map directly to micro-USD per token.
        estimatedCostMicrousd: Math.round(inputTokens * rates.input + outputTokens * rates.output),
    };
}
function mergeAiUsage(left, right) {
    return {
        model: right.model || left.model,
        inputTokens: left.inputTokens + right.inputTokens,
        outputTokens: left.outputTokens + right.outputTokens,
        estimatedCostMicrousd: left.estimatedCostMicrousd + right.estimatedCostMicrousd,
    };
}
function getAiUsageFromError(error) {
    return error instanceof AiUsageError ? error.usage : emptyAiUsage();
}
function getAiErrorTelemetry(error) {
    const rootCause = error instanceof AiUsageError ? error.cause : error;
    const providerError = rootCause && typeof rootCause === 'object'
        ? rootCause
        : null;
    const providerStatus = typeof providerError?.status === 'number'
        ? providerError.status
        : undefined;
    const providerRequestId = typeof providerError?.request_id === 'string'
        ? providerError.request_id
        : undefined;
    return {
        code: error instanceof Error ? error.name : 'unknown',
        ...(providerStatus === undefined ? {} : { providerStatus }),
        ...(providerRequestId ? { providerRequestId } : {}),
    };
}
function getAiSpendConfig(plan, purpose) {
    const normalizedPlan = (0, plan_limits_1.normalizePlan)(plan);
    const reservationEnv = purpose === 'intent'
        ? process.env.ANTHROPIC_INTENT_RESERVATION_USD
        : process.env.ANTHROPIC_DRAFT_RESERVATION_USD;
    return {
        reservationMicrousd: parsePositiveUsd(reservationEnv, DEFAULT_RESERVATION_MICROUSD[purpose] / 1_000_000),
        userMonthlyLimitMicrousd: parsePositiveUsd(process.env[USER_LIMIT_ENV[normalizedPlan]], USER_MONTHLY_LIMIT_MICROUSD[normalizedPlan] / 1_000_000),
        globalMonthlyLimitMicrousd: parsePositiveUsd(process.env.ANTHROPIC_GLOBAL_MONTHLY_SPEND_LIMIT_USD, 200),
    };
}
async function reserveAiSpend(client, input) {
    const config = getAiSpendConfig(input.plan, input.purpose);
    const { data, error } = await client.rpc('reserve_ai_spend', {
        p_user_id: input.userId,
        p_purpose: input.purpose,
        p_estimated_microusd: config.reservationMicrousd,
        p_user_monthly_limit_microusd: config.userMonthlyLimitMicrousd,
        p_global_monthly_limit_microusd: config.globalMonthlyLimitMicrousd,
    });
    if (error) {
        throw new Error(`AI spend reservation failed: ${error.message}`);
    }
    return typeof data === 'string'
        ? { id: data, reservedMicrousd: config.reservationMicrousd }
        : null;
}
async function recordAiUsage(client, input) {
    const { error } = await client.rpc('record_ai_usage', {
        p_reservation_id: input.reservationId,
        p_model: input.usage.model,
        p_input_tokens: input.usage.inputTokens,
        p_output_tokens: input.usage.outputTokens,
        p_cost_microusd: input.usage.estimatedCostMicrousd,
    });
    if (error) {
        throw new Error(`AI usage recording failed: ${error.message}`);
    }
}
async function releaseAiSpend(client, reservationId) {
    const { error } = await client.rpc('release_ai_spend', {
        p_reservation_id: reservationId,
    });
    if (error) {
        throw new Error(`AI spend release failed: ${error.message}`);
    }
}
