"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.containsConfiguredPhrase = containsConfiguredPhrase;
exports.containsConfiguredPhraseOrAlias = containsConfiguredPhraseOrAlias;
/**
 * Match a configured phrase as whole normalized words. This prevents a short
 * keyword such as "lead" from matching unrelated words, while treating
 * punctuation and whitespace as equivalent separators.
 */
function normalize(value) {
    return (value ?? '')
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
const CONTROLLED_PHRASE_ALIASES = {
    'lead generation': [
        'generate leads',
        'generating leads',
        'find leads',
        'finding leads',
        'customer acquisition',
        'get customers',
        'getting customers',
    ],
    'cold email': ['cold emailing', 'cold outreach', 'outbound email', 'email outreach'],
    marketing: ['marketing strategy', 'go to market', 'customer acquisition'],
    sales: ['sales process', 'selling', 'close deals', 'closing deals'],
};
function containsConfiguredPhrase(text, phrase) {
    const normalizedText = normalize(text);
    const normalizedPhrase = normalize(phrase);
    if (!normalizedText || !normalizedPhrase)
        return false;
    return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}
/**
 * Expand only a reviewed, deliberately small alias list. The downstream
 * buying-signal and promotional-noise gates still have to pass, so aliases do
 * not turn broad topical mentions into opportunities by themselves.
 */
function containsConfiguredPhraseOrAlias(text, phrase) {
    if (containsConfiguredPhrase(text, phrase))
        return true;
    const normalizedPhrase = normalize(phrase);
    const aliases = CONTROLLED_PHRASE_ALIASES[normalizedPhrase] ?? [];
    return aliases.some(alias => containsConfiguredPhrase(text, alias));
}
