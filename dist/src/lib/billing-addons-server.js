"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAddonProductId = getAddonProductId;
exports.getAddonPackFromProductId = getAddonPackFromProductId;
exports.normalizeAddonPackId = normalizeAddonPackId;
const billing_addons_1 = require("./billing-addons");
const PRODUCT_ENV_BY_PACK = {
    signals_20: 'DODO_PAYMENTS_SIGNAL_20_PRODUCT_ID',
    signals_50: 'DODO_PAYMENTS_SIGNAL_50_PRODUCT_ID',
    signals_120: 'DODO_PAYMENTS_SIGNAL_120_PRODUCT_ID',
    drafts_5: 'DODO_PAYMENTS_DRAFT_5_PRODUCT_ID',
    drafts_12: 'DODO_PAYMENTS_DRAFT_12_PRODUCT_ID',
    drafts_30: 'DODO_PAYMENTS_DRAFT_30_PRODUCT_ID',
};
function getAddonProductId(packId) {
    return process.env[PRODUCT_ENV_BY_PACK[packId]];
}
function getAddonPackFromProductId(productId) {
    if (!productId)
        return null;
    for (const packId of billing_addons_1.BILLING_ADDON_PACK_IDS) {
        if (getAddonProductId(packId) === productId)
            return billing_addons_1.BILLING_ADDON_PACKS[packId];
    }
    return null;
}
function normalizeAddonPackId(value) {
    return typeof value === 'string' && value in billing_addons_1.BILLING_ADDON_PACKS
        ? value
        : null;
}
