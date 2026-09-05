"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BILLING_ADDONS = exports.BILLING_ADDON_PACK_IDS = exports.BILLING_ADDON_PACKS = void 0;
exports.getBillingAddonPacks = getBillingAddonPacks;
exports.getBillingAddonPack = getBillingAddonPack;
exports.getDefaultBillingAddonPack = getDefaultBillingAddonPack;
exports.getCurrentUsageMonth = getCurrentUsageMonth;
exports.emptyMonthlyAddonCredits = emptyMonthlyAddonCredits;
exports.sumMonthlyAddonCredits = sumMonthlyAddonCredits;
exports.getPlanLimitsWithAddons = getPlanLimitsWithAddons;
const plan_limits_1 = require("./plan-limits");
/** One-time capacity packs. IDs are stable server-side entitlement contracts. */
exports.BILLING_ADDON_PACKS = {
    signals_20: {
        id: 'signals_20', type: 'signals', credits: 20, priceUsd: 5,
        priceLabel: '$5', ctaLabel: '+20 signals for $5',
        description: '20 extra monitored signals for the current month.',
    },
    signals_50: {
        id: 'signals_50', type: 'signals', credits: 50, priceUsd: 10,
        priceLabel: '$10', ctaLabel: '+50 signals for $10',
        description: '50 extra monitored signals for the current month.', popular: true,
    },
    signals_120: {
        id: 'signals_120', type: 'signals', credits: 120, priceUsd: 20,
        priceLabel: '$20', ctaLabel: '+120 signals for $20',
        description: '120 extra monitored signals for the current month.',
    },
    drafts_5: {
        id: 'drafts_5', type: 'drafts', credits: 5, priceUsd: 5,
        priceLabel: '$5', ctaLabel: '+5 AI drafts for $5',
        description: '5 extra AI drafts for the current month.',
    },
    drafts_12: {
        id: 'drafts_12', type: 'drafts', credits: 12, priceUsd: 10,
        priceLabel: '$10', ctaLabel: '+12 AI drafts for $10',
        description: '12 extra AI drafts for the current month.', popular: true,
    },
    drafts_30: {
        id: 'drafts_30', type: 'drafts', credits: 30, priceUsd: 20,
        priceLabel: '$20', ctaLabel: '+30 AI drafts for $20',
        description: '30 extra AI drafts for the current month.',
    },
};
exports.BILLING_ADDON_PACK_IDS = Object.keys(exports.BILLING_ADDON_PACKS);
function getBillingAddonPacks(type) {
    return exports.BILLING_ADDON_PACK_IDS
        .map((id) => exports.BILLING_ADDON_PACKS[id])
        .filter((pack) => pack.type === type);
}
function getBillingAddonPack(packId) {
    return exports.BILLING_ADDON_PACKS[packId];
}
function getDefaultBillingAddonPack(type) {
    return type === 'signals' ? exports.BILLING_ADDON_PACKS.signals_20 : exports.BILLING_ADDON_PACKS.drafts_5;
}
// Compatibility aliases for small inline prompts; the picker provides choice.
exports.BILLING_ADDONS = {
    signals: exports.BILLING_ADDON_PACKS.signals_20,
    drafts: exports.BILLING_ADDON_PACKS.drafts_5,
};
function getCurrentUsageMonth(now = new Date()) {
    return `${now.toISOString().slice(0, 7)}-01`;
}
function emptyMonthlyAddonCredits() {
    return { signals: 0, drafts: 0 };
}
function sumMonthlyAddonCredits(rows) {
    const credits = emptyMonthlyAddonCredits();
    for (const row of rows ?? []) {
        if (row.addon_type === 'signals')
            credits.signals += Math.max(0, Number(row.credits) || 0);
        if (row.addon_type === 'drafts')
            credits.drafts += Math.max(0, Number(row.credits) || 0);
    }
    return credits;
}
function getPlanLimitsWithAddons(plan, addonCredits) {
    const base = (0, plan_limits_1.getPlanLimits)(plan);
    return {
        ...base,
        threadsPerMonth: base.threadsPerMonth + addonCredits.signals,
        aiDraftsPerMonth: base.aiDraftsPerMonth + addonCredits.drafts,
    };
}
