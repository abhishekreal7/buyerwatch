import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('password recovery routing', () => {
  it('uses a dedicated PKCE callback before opening the reset form', () => {
    const authActions = source('src/app/actions/auth.ts')
    const recoveryRoute = source('src/app/auth/recovery/route.ts')

    expect(authActions).toContain("redirectTo: `${origin}/auth/recovery`")
    expect(recoveryRoute).toContain('exchangeCodeForSession(code)')
    expect(recoveryRoute).toContain("new URL('/reset-password', request.url)")
    expect(recoveryRoute).not.toContain("new URL('/dashboard'")
  })

  it('allow-lists recovery callbacks for every production hostname', () => {
    const config = source('supabase/config.toml')

    expect(config).toContain('https://buyerwatch.co/auth/recovery')
    expect(config).toContain('https://www.buyerwatch.co/auth/recovery')
  })
})
