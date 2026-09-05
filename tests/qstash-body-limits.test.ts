import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('QStash job body limits', () => {
  it.each([
    ['score', 128_000],
    ['send', 16_384],
  ])('bounds the %s body before signature verification', (job, maximum) => {
    const route = source(`src/app/api/jobs/${job}/route.ts`)
    const readIndex = route.indexOf(`readTextBody(request, ${maximum.toLocaleString('en-US').replace(/,/g, '_')})`)
    const verifyIndex = route.indexOf('verifyQStashRequest(request, rawBody)')
    expect(readIndex).toBeGreaterThan(-1)
    expect(verifyIndex).toBeGreaterThan(readIndex)
    expect(route).toContain("status: error.message === 'request_too_large' ? 413 : 400")
  })
})
