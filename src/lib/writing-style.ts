export const TONE_ARCHETYPES = {
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
} as const

export const STYLE_GUARDRAILS = {
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
} as const

export type ToneArchetype = keyof typeof TONE_ARCHETYPES
export type StyleGuardrail = keyof typeof STYLE_GUARDRAILS

export function isToneArchetype(value: unknown): value is ToneArchetype {
  return typeof value === 'string' && value in TONE_ARCHETYPES
}

export function normalizeStyleGuardrails(value: unknown): StyleGuardrail[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is StyleGuardrail => typeof item === 'string' && item in STYLE_GUARDRAILS,
  )
}

export function getToneArchetypeInstruction(value: unknown): string | null {
  return isToneArchetype(value) ? TONE_ARCHETYPES[value].instruction : null
}

export function getStyleGuardrailInstructions(value: unknown): string[] {
  return normalizeStyleGuardrails(value).map((guardrail) => STYLE_GUARDRAILS[guardrail].instruction)
}
