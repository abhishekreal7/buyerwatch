import { describe, expect, it } from 'vitest'
import {
  getStyleGuardrailInstructions,
  getToneArchetypeInstruction,
  isToneArchetype,
  normalizeStyleGuardrails,
} from '../src/lib/writing-style'

describe('writing style profile controls', () => {
  it('accepts only supported tone archetypes', () => {
    expect(isToneArchetype('consultative')).toBe(true)
    expect(isToneArchetype('problem_solver')).toBe(true)
    expect(isToneArchetype('invented-tone')).toBe(false)
    expect(getToneArchetypeInstruction('invented-tone')).toBeNull()
  })

  it('filters unknown and malformed guardrails', () => {
    expect(normalizeStyleGuardrails([
      'no_emojis',
      'never_pitch_directly',
      'unknown_guardrail',
      42,
    ])).toEqual(['no_emojis', 'never_pitch_directly'])
    expect(normalizeStyleGuardrails(null)).toEqual([])
  })

  it('turns persisted guardrails into concrete drafting instructions', () => {
    const instructions = getStyleGuardrailInstructions([
      'include_affiliation_disclosure',
      'lead_with_value_first',
    ])

    expect(instructions).toHaveLength(2)
    expect(instructions[0]).toContain('affiliation disclosure')
    expect(instructions[1]).toContain('Open with useful advice')
  })
})
