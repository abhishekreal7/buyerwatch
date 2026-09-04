export type CapacityNotice = {
  resource: 'signals' | 'drafts'
  remaining: number
  limit: number
  used: number
}

type Capacity = {
  resource: CapacityNotice['resource']
  used: number
  limit: number
}

const LOW_CAPACITY_RATIO = 0.8

/**
 * Returns the most constrained available allowance once 80% has been used.
 * Zero allowances are intentionally excluded: they are plan entitlements, not
 * a consumable balance that can be "running low".
 */
export function getLowCapacityNotice(capacities: Capacity[]): CapacityNotice | null {
  const candidates = capacities
    .filter(({ used, limit }) => limit > 0 && used >= 0 && used < limit && used / limit >= LOW_CAPACITY_RATIO)
    .map(({ resource, used, limit }) => ({ resource, used, limit, remaining: limit - used }))
    .sort((left, right) => (left.remaining / left.limit) - (right.remaining / right.limit))

  return candidates[0] ?? null
}
