"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTENT_LABELS = void 0;
exports.parseIntentResult = parseIntentResult;
exports.getIntentDisplayLabel = getIntentDisplayLabel;
exports.INTENT_LABELS = ['buying', 'researching', 'complaining', 'other'];
function parseIntentResult(value) {
    if (!value || typeof value !== 'object') {
        throw new Error('Intent provider returned a non-object response');
    }
    const candidate = value;
    const score = candidate.score;
    const label = candidate.label;
    const reasoning = candidate.reasoning;
    const flag = candidate.flag;
    if (typeof score !== 'number'
        || !Number.isFinite(score)
        || score < 0
        || score > 100
        || typeof label !== 'string'
        || !exports.INTENT_LABELS.includes(label)
        || typeof reasoning !== 'string'
        || reasoning.trim().length < 8
        || reasoning.trim().length > 500
        || (flag !== undefined && flag !== null && flag !== 'COMPETITOR_RISK')) {
        throw new Error('Intent provider returned an invalid response');
    }
    const roundedScore = Math.round(score);
    const expectedLabel = roundedScore >= 80
        ? 'buying'
        : roundedScore >= 60
            ? 'researching'
            : roundedScore >= 40
                ? 'complaining'
                : 'other';
    if (label !== expectedLabel) {
        throw new Error('Intent provider returned an inconsistent score and label');
    }
    return {
        score: roundedScore,
        label: label,
        reasoning: reasoning.trim(),
        ...(flag === 'COMPETITOR_RISK' ? { flag } : {}),
    };
}
function getIntentDisplayLabel(label, score) {
    if (label === 'buying')
        return 'Buying intent';
    if (label === 'researching')
        return 'Researching';
    if (label === 'complaining')
        return 'Pain signal';
    if (label === 'other')
        return 'Low relevance';
    if (score >= 80)
        return 'Buying intent';
    if (score >= 60)
        return 'Researching';
    return 'Low relevance';
}
