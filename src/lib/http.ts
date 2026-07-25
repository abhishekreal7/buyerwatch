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
