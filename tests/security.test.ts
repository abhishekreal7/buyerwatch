import { describe, expect, it } from 'vitest'
import { isAuthorizedCronRequest } from '../src/lib/security/cron-auth'
import {
  assertPublicHttpUrl,
  getSafeHttpUrl,
  isAllowedSlackWebhookUrl,
  isPrivateOrReservedIp,
} from '../src/lib/security/outbound-url'

describe('cron authorization', () => {
  it('fails closed when the secret is absent', () => {
    expect(isAuthorizedCronRequest('Bearer undefined', undefined)).toBe(false)
  })

  it('accepts only an exact configured bearer token', () => {
    expect(isAuthorizedCronRequest('Bearer expected', 'expected')).toBe(true)
    expect(isAuthorizedCronRequest('Bearer wrong', 'expected')).toBe(false)
  })
})

describe('outbound URL guards', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('blocks private or reserved address %s', (address) => {
    expect(isPrivateOrReservedIp(address)).toBe(true)
  })

  it('rejects literal private destinations before connecting', async () => {
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data'))
      .rejects.toThrow('Private network destinations are not allowed')
  })

  it('allows only genuine Slack webhook endpoints', () => {
    expect(isAllowedSlackWebhookUrl('https://hooks.slack.com/services/T1/B2/token_3')).toBe(true)
    expect(isAllowedSlackWebhookUrl('https://hooks.slack.com.evil.test/services/T1/B2/token')).toBe(false)
    expect(isAllowedSlackWebhookUrl('http://hooks.slack.com/services/T1/B2/token')).toBe(false)
  })

  it('rejects non-HTTP redirect schemes and credentials', () => {
    expect(getSafeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(getSafeHttpUrl('https://user:pass@example.com')).toBeNull()
    expect(getSafeHttpUrl('https://example.com/path')?.hostname).toBe('example.com')
  })
})
