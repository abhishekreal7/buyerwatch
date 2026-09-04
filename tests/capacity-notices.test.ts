import { describe, expect, it } from 'vitest'
import { getLowCapacityNotice } from '../src/lib/capacity-notices'

describe('getLowCapacityNotice', () => {
  it('notifies only after 80% of an available allowance is used', () => {
    expect(getLowCapacityNotice([{ resource: 'signals', used: 7, limit: 10 }])).toBeNull()
    expect(getLowCapacityNotice([{ resource: 'signals', used: 8, limit: 10 }])).toMatchObject({
      resource: 'signals',
      remaining: 2,
    })
  })

  it('does not label zero or exhausted allowances as running low', () => {
    expect(getLowCapacityNotice([{ resource: 'drafts', used: 0, limit: 0 }])).toBeNull()
    expect(getLowCapacityNotice([{ resource: 'drafts', used: 10, limit: 10 }])).toBeNull()
  })

  it('prioritizes the allowance with the least proportion remaining', () => {
    expect(getLowCapacityNotice([
      { resource: 'signals', used: 80, limit: 100 },
      { resource: 'drafts', used: 9, limit: 10 },
    ])).toMatchObject({ resource: 'drafts', remaining: 1 })
  })
})
