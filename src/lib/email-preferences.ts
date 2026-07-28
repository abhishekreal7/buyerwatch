import { createHmac, timingSafeEqual } from 'node:crypto'
import { getAppUrl } from './app-url'

function secret(): string {
  const value = process.env.EMAIL_UNSUBSCRIBE_SECRET
  if (!value || value.length < 32) {
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET must contain at least 32 characters')
  }
  return value
}

export function createUnsubscribeUrl(userId: string, now = new Date()): string {
  const expires = Math.floor(now.getTime() / 1_000) + 365 * 24 * 60 * 60
  const payload = `${userId}.${expires}`
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url')
  const token = Buffer.from(`${payload}.${signature}`).toString('base64url')
  return `${getAppUrl()}/api/unsubscribe?token=${encodeURIComponent(token)}`
}

export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const [userId, expiresValue, signature] = decoded.split('.')
    const expires = Number(expiresValue)
    if (
      !/^[0-9a-f-]{36}$/i.test(userId)
      || !Number.isInteger(expires)
      || expires < Math.floor(Date.now() / 1_000)
      || !signature
    ) return null
    const expected = createHmac('sha256', secret())
      .update(`${userId}.${expires}`)
      .digest('base64url')
    const left = Buffer.from(signature)
    const right = Buffer.from(expected)
    return left.length === right.length && timingSafeEqual(left, right) ? userId : null
  } catch {
    return null
  }
}
