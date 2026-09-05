import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('conversion webhook concurrency', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/webhooks/conversion/route.ts'),
    'utf8',
  )

  it('atomically permits only the first non-replacement conversion', () => {
    expect(route).toContain("update = update.is('converted_at', null)")
    expect(route).toContain("update.select('id').maybeSingle()")
    expect(route).toContain('if (!updated)')
    expect(route).not.toContain('if (attribution.converted_at && replace !== true)')
  })
})
