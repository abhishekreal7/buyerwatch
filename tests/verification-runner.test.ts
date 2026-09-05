import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('verification runner', () => {
  it('runs and reports every stage independently', () => {
    const runner = source('scripts/verify.mjs')
    for (const stage of ['typecheck', 'lint', 'test', 'audit', 'build']) {
      expect(runner).toContain(`'${stage}'`)
    }
    expect(runner).toContain('for (const [name, command] of stages)')
    expect(runner).toContain('verification summary')
  })

  it('uses App Router navigation for internal client routes', () => {
    expect(source('src/components/DashboardLayout.tsx')).toContain("router.push('/pricing')")
    const onboarding = source('src/components/OnboardingHeaderActions.tsx')
    expect(onboarding).not.toContain('window.location.href')
    expect(onboarding).toContain("router.replace('/login')")
  })
})
