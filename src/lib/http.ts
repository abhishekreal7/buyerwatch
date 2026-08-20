export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs)

  const forwardAbort = () => timeoutController.abort()
  init.signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    return await fetch(input, { ...init, signal: timeoutController.signal })
  } finally {
    clearTimeout(timeout)
    init.signal?.removeEventListener('abort', forwardAbort)
  }
}

/**
 * Read a fetch response without trusting Content-Length. The streaming limit
 * protects serverless memory even when a remote source omits or lies about the
 * declared response size.
 */
export async function readResponseText(
  response: Response,
  maxBytes = 256_000,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('invalid_response_size_limit')
  }

  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('response_too_large')
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let received = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error('response_too_large')
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return text
  } catch (error) {
    if (error instanceof Error && error.message === 'response_too_large') throw error
    throw new Error('response_unreadable', { cause: error })
  } finally {
    reader.releaseLock()
  }
}

export function createTimeoutFetch(timeoutMs = 10_000): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) =>
    fetchWithTimeout(input, init, timeoutMs)) as typeof fetch
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label = 'operation',
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
  })

  try {
    return await Promise.race([operation, deadline])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
