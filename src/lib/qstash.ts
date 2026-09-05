import { Client, Receiver, type FlowControl } from '@upstash/qstash'
import { getAppUrl } from './app-url'

export function hasQStashConfiguration(): boolean {
  return Boolean(
    process.env.QSTASH_TOKEN?.trim()
    && process.env.QSTASH_CURRENT_SIGNING_KEY?.trim()
    && process.env.QSTASH_NEXT_SIGNING_KEY?.trim(),
  )
}

export async function verifyQStashRequest(
  request: Request,
  body: string,
): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim()
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim()
  const signature = request.headers.get('upstash-signature')
  if (!currentSigningKey || !nextSigningKey || !signature) return false

  const receiver = new Receiver({ currentSigningKey, nextSigningKey })
  try {
    return await receiver.verify({
      signature,
      body,
      url: request.url,
      upstashRegion: request.headers.get('upstash-region') ?? undefined,
    })
  } catch {
    return false
  }
}

export async function publishQStashJson<T>(
  path: string,
  body: T,
  options: {
    retries?: number
    timeout?: number | `${bigint}s` | `${bigint}m` | `${bigint}h` | `${bigint}d`
    delay?: number | `${bigint}s` | `${bigint}m` | `${bigint}h` | `${bigint}d`
    flowControl?: FlowControl
  } = {},
): Promise<string | null> {
  const token = process.env.QSTASH_TOKEN?.trim()
  if (!token) return null

  const result = await new Client({ token }).publishJSON({
    url: `${getAppUrl()}${path.startsWith('/') ? path : `/${path}`}`,
    body,
    retries: options.retries ?? 2,
    timeout: options.timeout ?? '4m',
    delay: options.delay,
    flowControl: options.flowControl,
  })
  return 'messageId' in result ? result.messageId : null
}

export async function cancelQStashMessage(messageId: string): Promise<number> {
  const token = process.env.QSTASH_TOKEN?.trim()
  if (!token) throw new Error('QStash is not configured')
  const result = await new Client({ token }).messages.cancel(messageId)
  return result.cancelled
}

export function publishMonitoringRun(
  forceUserId?: string,
  forceTarget?: string,
  forcePlatform?: 'reddit' | 'bluesky' | 'x',
): Promise<string | null> {
  return publishQStashJson(
    '/api/cron/enqueue',
    forceUserId
      ? {
          forceUserId,
          ...(forceTarget ? { forceTarget } : {}),
          ...(forcePlatform ? { forcePlatform } : {}),
        }
      : {},
  )
}
