import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('tracked redirect reliability', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/r/[shortcode]/route.ts'), 'utf8')

  it('isolates analytics failures after resolving the customer destination', () => {
    const resolved = route.indexOf('const destination =')
    const trackingCatch = route.indexOf("'Short-link click tracking failed open'")
    const customerRedirect = route.indexOf('return NextResponse.redirect(destination')
    expect(resolved).toBeGreaterThan(-1)
    expect(trackingCatch).toBeGreaterThan(resolved)
    expect(customerRedirect).toBeGreaterThan(trackingCatch)
  })
})
