"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STYLE_GUARDRAILS = exports.TONE_ARCHETYPES = void 0;
exports.isToneArchetype = isToneArchetype;
exports.normalizeStyleGuardrails = normalizeStyleGuardrails;
exports.getToneArchetypeInstruction = getToneArchetypeInstruction;
exports.getStyleGuardrailInstructions = getStyleGuardrailInstructions;
exports.TONE_ARCHETYPES = {
    consultative: {
        label: 'Consultative Expert',
        description: 'Informative, helpful, and grounded in practical trade-offs.',
        instruction: 'Write as a consultative expert: explain the practical trade-off first, then offer a clear recommendation without sounding promotional.',
    },
    casual: {
        label: 'Casual Peer',
        description: 'Friendly, informal, and naturally conversational.',
        instruction: 'Write like a knowledgeable peer: use relaxed, natural phrasing and avoid corporate language or buzzwords.',
    },
    direct: {
        label: 'Direct & Concise',
        description: 'Short, decisive, and immediately useful.',
        instruction: 'Be direct and concise: answer in no more than three short paragraphs, remove filler, and get to the useful point immediately.',
    },
    problem_solver: {
        label: 'Problem Solver',
        description: 'Diagnostic, methodical, and focused on next steps.',
        instruction: 'Write as a practical problem solver: identify the likely root cause, give concrete next steps, and make uncertainty explicit.',
    },
};
exports.STYLE_GUARDRAILS = {
    no_emojis: {
        label: 'No Emojis',
        instruction: 'Do not use emojis.',
    },
    casual_lowercase: {
        label: 'Casual Lowercase',
        instruction: 'Use natural sentence casing and avoid title-case marketing language.',
    },
    include_affiliation_disclosure: {
        label: 'Include Affiliation Disclosure',
        instruction: 'Whenever the product or its link is mentioned, include a brief, natural affiliation disclosure.',
    },
    lead_with_value_first: {
        label: 'Lead with Value First',
        instruction: 'Open with useful advice or a concrete observation, never with the product.',
    },
    never_pitch_directly: {
        label: 'Never Pitch Directly',
        instruction: 'Do not pitch, use a call to action, or ask the reader to contact, sign up, or book anything.',
    },
};
function isToneArchetype(value) {
    return typeof value === 'string' && value in exports.TONE_ARCHETYPES;
}
function normalizeStyleGuardrails(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string' && item in exports.STYLE_GUARDRAILS);
}
function getToneArchetypeInstruction(value) {
    return isToneArchetype(value) ? exports.TONE_ARCHETYPES[value].instruction : null;
}
function getStyleGuardrailInstructions(value) {
    return normalizeStyleGuardrails(value).map((guardrail) => exports.STYLE_GUARDRAILS[guardrail].instruction);
}
