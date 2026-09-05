import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('signup confirmation', () => {
  it('shows a precise error for both explicit and intentionally obscured duplicate signups', () => {
    const action = source('src/app/actions/auth.ts')
    const page = source('src/app/signup/page.tsx')

    expect(action).toContain("error?.code === 'user_already_exists'")
    expect(action).toContain("error?.code === 'email_exists'")
    expect(action).toContain('(data.user.identities?.length ?? 0) === 0')
    expect(action).toContain('This email is already registered. Log in instead.')
    expect(action).toContain('Check your email to verify your account.')
    expect(page).toContain('<span>Continue with Google</span>')
  })
})
