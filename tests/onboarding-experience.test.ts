import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const wizardSource = readFileSync(
  resolve(process.cwd(), 'src/components/OnboardingWizard.tsx'),
  'utf8',
)

describe('first-run onboarding experience', () => {
  it('does not advertise stale free-plan or real-time behavior', () => {
    expect(wizardSource).not.toContain('Your {planLabel} plan')
    expect(wizardSource).not.toContain('notify you in real time')
    expect(wizardSource).not.toContain('Free plan')
  })

  it('does not silently discard monitoring rules above the plan limit', () => {
    expect(wizardSource).not.toContain('requestedRules.slice(0, keywordLimit)')
    expect(wizardSource).toContain('This setup creates ${requestedRules.length} monitoring rules')
  })

  it('explains activation, Reddit identity, and progress clearly', () => {
    expect(wizardSource).toContain('Setup summary')
    expect(wizardSource).toContain('This does not connect your Reddit account')
    expect(wizardSource).toContain('Step {step} of 4')
    expect(wizardSource).toContain('aria-current={step === i')
  })
})
