import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSafeThreadUrl } from '../src/lib/thread-url'

describe('opportunity source links', () => {
  it('allows Reddit post links and short links', () => {
    expect(getSafeThreadUrl({
      platform: 'reddit',
      url: 'https://www.reddit.com/r/SaaS/comments/abc123/example/',
    })).toBe('https://www.reddit.com/r/SaaS/comments/abc123/example/')
    expect(getSafeThreadUrl({
      platform: 'reddit',
      url: 'https://redd.it/abc123',
    })).toBe('https://redd.it/abc123')
  })

  it('allows Bluesky post links', () => {
    expect(getSafeThreadUrl({
      platform: 'bluesky',
      url: 'https://bsky.app/profile/example.com/post/abc123',
    })).toBe('https://bsky.app/profile/example.com/post/abc123')
  })

  it('rejects insecure, malformed, and platform-mismatched links', () => {
    expect(getSafeThreadUrl({ platform: 'reddit', url: 'http://reddit.com/post' })).toBeNull()
    expect(getSafeThreadUrl({ platform: 'reddit', url: 'https://reddit.com.evil.test/post' })).toBeNull()
    expect(getSafeThreadUrl({ platform: 'reddit', url: 'https://bsky.app/profile/test/post/1' })).toBeNull()
    expect(getSafeThreadUrl({ platform: 'reddit', url: 'not-a-url' })).toBeNull()
  })

  it('keeps a dedicated source action on dashboard opportunity cards', () => {
    const dashboard = readFileSync(
      join(process.cwd(), 'src/app/(dashboard)/dashboard/page.tsx'),
      'utf8',
    )

    expect(dashboard).toContain('Open post')
    expect(dashboard).toContain('href={getSafeThreadUrl(thread) ?? undefined}')
    expect(dashboard).toContain('onClick={(event) => event.stopPropagation()}')
    expect(dashboard).toContain('target="_blank"')
  })
})
