export class RequestInputError extends Error {
  constructor(message = 'invalid_request') {
    super(message)
    this.name = 'RequestInputError'
  }
}

/**
 * Protect cookie-authenticated browser mutations from cross-site submission.
 * Production callers must provide a same-origin Origin header; development
 * keeps headerless CLI smoke checks possible.
 */
export function isTrustedSameOriginMutation(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return false

  const origin = request.headers.get('origin')
  if (!origin) return process.env.NODE_ENV !== 'production'
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes = 16_384,
): Promise<T> {
  const text = await readTextBody(request, maxBytes)
  if (!text.trim()) return {} as T

  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new RequestInputError()
    }
    return value as T
  } catch (error) {
    if (error instanceof RequestInputError) throw error
    throw new RequestInputError('invalid_json')
  }
}

export async function readTextBody(
  request: Request,
  maxBytes = 256_000,
): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestInputError('request_too_large')
  }

  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new RequestInputError('request_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new RequestInputError('invalid_encoding')
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function boundedString(
  value: unknown,
  maximum: number,
  options: { required?: boolean; trim?: boolean } = {},
): string | null {
  if (typeof value !== 'string') return options.required ? null : ''
  const result = options.trim === false ? value : value.trim()
  if ((options.required && !result) || result.length > maximum) return null
  return result
}
