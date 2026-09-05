"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_HIGH_INTENT_THRESHOLD = exports.HIGH_INTENT_THRESHOLD_MAX = exports.HIGH_INTENT_THRESHOLD_MIN = void 0;
exports.normalizeHighIntentThreshold = normalizeHighIntentThreshold;
exports.HIGH_INTENT_THRESHOLD_MIN = 60;
exports.HIGH_INTENT_THRESHOLD_MAX = 95;
exports.DEFAULT_HIGH_INTENT_THRESHOLD = 80;
function normalizeHighIntentThreshold(value) {
    const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : Number.NaN;
    if (!Number.isFinite(parsed))
        return exports.DEFAULT_HIGH_INTENT_THRESHOLD;
    return Math.min(exports.HIGH_INTENT_THRESHOLD_MAX, Math.max(exports.HIGH_INTENT_THRESHOLD_MIN, Math.round(parsed)));
}
