import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('account deletion state machine', () => {
  const migration = source('supabase/migrations/20260824122000_account_deletion_state_machine.sql')
  const processor = source('src/lib/account-deletion.ts')
  const route = source('src/app/api/account/route.ts')

  it('persists each deletion stage independently of the profile row', () => {
    expect(migration).toContain('create table if not exists public.account_deletion_requests')
    expect(migration).not.toContain('references public.profiles')
    for (const state of ['pending', 'billing_cancelled', 'completed', 'failed']) {
      expect(migration).toContain(`'${state}'`)
    }
  })

  it('does not repeat a recorded billing cancellation and queues recovery', () => {
    expect(processor).toContain('!request.billing_cancelled_at')
    expect(route).toContain("publishQStashJson(\n        '/api/jobs/account-deletion'")
    expect(route).toContain('{ success: false, pending: true }')
  })
})
