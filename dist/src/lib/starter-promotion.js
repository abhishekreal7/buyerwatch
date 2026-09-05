"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STARTER_PROMOTION = void 0;
exports.isStarterPromotionActive = isStarterPromotionActive;
exports.appliesStarterPromotion = appliesStarterPromotion;
exports.getStarterPromotionDiscountCode = getStarterPromotionDiscountCode;
exports.STARTER_PROMOTION = {
    code: 'START19',
    standardMonthlyPriceUsd: 39,
    introductoryMonthlyPriceUsd: 19,
    endsAt: '2026-09-15T23:59:59.000Z',
    subscriptionCycles: 1,
    redemptionLimit: 50,
};
function isStarterPromotionActive(now = new Date()) {
    return now.getTime() <= Date.parse(exports.STARTER_PROMOTION.endsAt);
}
function appliesStarterPromotion(plan, cadence, now = new Date()) {
    return plan === 'starter' && cadence === 'monthly' && isStarterPromotionActive(now);
}
function getStarterPromotionDiscountCode(plan, cadence, now = new Date()) {
    return appliesStarterPromotion(plan, cadence, now)
        ? exports.STARTER_PROMOTION.code
        : undefined;
}
