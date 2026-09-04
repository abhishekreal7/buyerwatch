"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeBuyingSignals = analyzeBuyingSignals;
exports.hasBuyingSignal = hasBuyingSignal;
exports.matchedSignals = matchedSignals;
const phrase_match_1 = require("./phrase-match");
/**
 * Buying-signal pre-filter
 *
 * A zero-cost, deterministic gate that runs before any intent-model call.
 * Purpose: eliminate posts with no commercial shape so every AI call counts.
 *
 * Philosophy:
 *   - False negatives (missing a real lead) are worse than false positives
 *     (passing a borderline post to the intent model). So signals are intentionally
 *     broad — we're filtering OUT obvious noise, not filtering IN only leads.
 *   - This list is a product decision, not a technical one. Edit freely.
 *   - All matching is case-insensitive, whole-word where marked with \b.
 */
/** Phrases that indicate a person is actively seeking a solution or product */
const SEEKING_SIGNALS = [
    'looking for',
    'looking to',
    'need a',
    'need an',
    'need help',
    'trying to find',
    'searching for',
    'anyone know of',
    'does anyone know',
    'point me to',
    'where can i',
    'how do i',
    'how can i',
    'is there a way',
    'is there a tool',
    'is there an app',
    'is there software',
];
/** Phrases that indicate product research or comparison */
const RESEARCH_SIGNALS = [
    'recommend',
    'recommendation',
    'suggestions',
    'anyone use',
    'anyone using',
    'anyone tried',
    'have you tried',
    'thoughts on',
    'experience with',
    'vs ',
    ' vs ',
    'alternative to',
    'alternatives to',
    'comparison',
    'best tool',
    'best app',
    'best software',
    'best way to',
    'best platform',
    'what do you use',
    'what are you using',
    'what software',
    'what tool',
    'worth it',
    'is it worth',
    'any good',
    'is it good',
    'pros and cons',
];
/** Phrases that indicate pain with a current solution (churn / switch intent) */
const PAIN_SIGNALS = [
    'frustrated with',
    'frustrated by',
    'sick of',
    'tired of',
    'hate that',
    'annoyed by',
    'switching from',
    'switched from',
    'canceling',
    'cancelled my',
    'too expensive',
    'overpriced',
    'wish there was',
    'struggling with',
    'can\'t figure out',
    'doesn\'t work',
    'stopped working',
    'broken',
    'buggy',
    'by hand',
    'manually',
    'too late',
    'already replied',
    'missing out',
];
/** Phrases that indicate purchase intent or evaluation */
const PURCHASE_SIGNALS = [
    'free trial',
    'pricing',
    'how much does',
    'how much is',
    'cost per',
    'per month',
    'per year',
    'per seat',
    'enterprise plan',
    'lifetime deal',
    'discount',
    'coupon',
    'worth buying',
    'should i buy',
    'should i pay',
    'roi',
    'evaluating vendors',
    'evaluating providers',
    'request for proposal',
    'approved budget',
    'approved a budget',
    'monthly budget',
    'annual budget',
    'vendor shortlist',
    'select a vendor',
];
const SIGNAL_GROUPS = [
    { category: 'seeking', signals: SEEKING_SIGNALS },
    { category: 'research', signals: RESEARCH_SIGNALS },
    { category: 'pain', signals: PAIN_SIGNALS },
    { category: 'purchase', signals: PURCHASE_SIGNALS },
];
function analyzeBuyingSignals(text) {
    const matches = [];
    const categories = [];
    for (const group of SIGNAL_GROUPS) {
        const groupMatches = group.signals.filter(signal => (0, phrase_match_1.containsConfiguredPhrase)(text, signal));
        if (groupMatches.length === 0)
            continue;
        categories.push(group.category);
        matches.push(...groupMatches);
    }
    return {
        matchedSignals: [...new Set(matches)],
        categories,
    };
}
/**
 * Returns true if the post text contains at least one buying signal.
 * Always pass `title + ' ' + body` as the input for maximum coverage.
 */
function hasBuyingSignal(text) {
    return analyzeBuyingSignals(text).matchedSignals.length > 0;
}
/**
 * Returns which signals were matched (useful for logging / debugging).
 */
function matchedSignals(text) {
    return analyzeBuyingSignals(text).matchedSignals;
}
