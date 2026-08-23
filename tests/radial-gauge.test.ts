import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('radial gauge display', () => {
  it('rounds repeating percentages before rendering the label', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/RadialGauge.tsx'), 'utf8')
    expect(source).toContain("Math.round(safePercentage * 10) / 10")
    expect(source).toContain('{displayPercentage}%')
    expect(source).not.toContain('{safePercentage}%')
  })
})
