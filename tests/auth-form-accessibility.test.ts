import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('authentication form accessibility', () => {
  it.each([
    ['login email', 'src/app/login/page.tsx', 'login-email'],
    ['login password', 'src/app/login/page.tsx', 'login-password'],
    ['signup email', 'src/app/signup/page.tsx', 'signup-email'],
    ['signup password', 'src/app/signup/page.tsx', 'signup-password'],
    ['forgot-password email', 'src/app/forgot-password/page.tsx', 'forgot-email'],
    ['new password', 'src/app/reset-password/page.tsx', 'reset-password'],
    ['confirm password', 'src/app/reset-password/page.tsx', 'reset-confirm-password'],
  ])('associates the %s label with its input', (_name, path, id) => {
    const page = source(path)
    expect(page).toContain(`htmlFor="${id}"`)
    expect(page).toContain(`id="${id}"`)
  })
})
