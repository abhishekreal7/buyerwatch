import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getHyperbrowserSessionOptions,
  isHyperbrowserProfileId,
  parseRedditProfileUsername,
  parseShredditPostAttributes,
} from '../src/lib/hyperbrowser-reddit'

const PROFILE_ID = '123e4567-e89b-42d3-a456-426614174000'
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Hyperbrowser Reddit delivery', () => {
  it('accepts only UUID profile identifiers', () => {
    expect(isHyperbrowserProfileId(PROFILE_ID)).toBe(true)
    expect(isHyperbrowserProfileId('profile-name')).toBe(false)
    expect(isHyperbrowserProfileId(`${PROFILE_ID}.evil`)).toBe(false)
  })

  it('launches the least-privileged short session and persists auth rotations', () => {
    expect(getHyperbrowserSessionOptions(PROFILE_ID)).toEqual(expect.objectContaining({
      useUltraStealth: false,
      useStealth: false,
      useProxy: false,
      solveCaptchas: false,
      enableWebRecording: false,
      enableVideoWebRecording: false,
      enableLogCapture: false,
      saveDownloads: false,
      disablePasswordManager: true,
      timeoutMinutes: 5,
      profile: { id: PROFILE_ID, persistChanges: true },
    }))
  })

  it('verifies the exact account-menu profile path after Reddit reveals it', () => {
    expect(parseRedditProfileUsername('/user/Practical_Onion7401/'))
      .toBe('Practical_Onion7401')
    expect(parseRedditProfileUsername('/user/Practical_Onion7401/communities'))
      .toBeNull()
    expect(parseRedditProfileUsername('/r/test/comments/abc')).toBeNull()
  })

  it('parses the current shreddit post contract and moderation flags', () => {
    expect(parseShredditPostAttributes({
      id: 't3_1vv81ef',
      author: 'prospect-user',
      'subreddit-prefixed-name': 'r/SaaS',
      'created-timestamp': '2026-08-22T09:44:26.337000+0000',
      'is-locked': '',
      'is-stickied': 'false',
      'is-nsfw': 'true',
    })).toEqual({
      id: '1vv81ef',
      author: 'prospect-user',
      subreddit: 'SaaS',
      createdAt: '2026-08-22T09:44:26.337Z',
      locked: true,
      stickied: false,
      over18: true,
    })
  })

  it('fails closed on incomplete post identity', () => {
    expect(parseShredditPostAttributes({ id: 't3_abc123' })).toBeNull()
  })

  it('stores only an encrypted profile mapping and never logs provider secrets', () => {
    const client = read('src/lib/hyperbrowser-reddit.ts')
    const sessionStore = read('src/lib/reddit-session.ts')
    const migration = read('supabase/migrations/20260822170000_hyperbrowser_reddit_provider.sql')
    expect(client).not.toContain('console.')
    expect(client).not.toContain('liveUrl')
    expect(client).not.toContain('sessionUrl')
    expect(sessionStore).toContain("provider: 'hyperbrowser'")
    expect(sessionStore).toContain('encrypt(JSON.stringify(stored))')
    expect(migration).not.toMatch(/password\s+text/i)
    expect(migration).not.toMatch(/cookie\s+text/i)
    expect(migration).toContain('to service_role')
  })

  it('never retries a write after the submit click begins', () => {
    const client = read('src/lib/hyperbrowser-reddit.ts')
    const sender = read('src/lib/send-reply.ts')
    expect(client).toContain("writeStarted = true")
    expect(client).toContain("'hyperbrowser_delivery_outcome_unknown'")
    expect(client).toContain('deliveryUncertain')
    expect(sender).toContain('if (deliveryUncertain) context.discard?.()')
  })

  it('activates Reddit\'s collapsed custom-element composer before editing', () => {
    const client = read('src/lib/hyperbrowser-reddit.ts')
    expect(client).toContain('faceplate-textarea-input[data-testid="trigger-button"]')
    expect(client).toContain('.filter({ visible: true })')
    expect(client.indexOf('.filter({ visible: true })'))
      .toBeLessThan(client.indexOf('writeStarted = true'))
  })
})
