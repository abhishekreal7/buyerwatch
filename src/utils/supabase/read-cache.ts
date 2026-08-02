type CachedResponse = {
  response: Response
  updatedAt: number
}

type ReadCacheOptions = {
  fetchImpl?: typeof fetch
  freshForMs?: number
  staleForMs?: number
  now?: () => number
}

const DEFAULT_FRESH_MS = 15_000
const DEFAULT_STALE_MS = 120_000

function isSupabaseRestRequest(request: Request) {
  try {
    return new URL(request.url).pathname.startsWith('/rest/v1/')
  } catch {
    return false
  }
}

function requestCacheKey(request: Request) {
  const headers = request.headers
  return [
    request.method,
    request.url,
    headers.get('authorization') ?? '',
    headers.get('accept-profile') ?? '',
    headers.get('content-profile') ?? '',
    headers.get('prefer') ?? '',
    headers.get('range') ?? '',
  ].join('\n')
}

export function createSupabaseReadCache(options: ReadCacheOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const freshForMs = options.freshForMs ?? DEFAULT_FRESH_MS
  const staleForMs = options.staleForMs ?? DEFAULT_STALE_MS
  const now = options.now ?? Date.now
  const responses = new Map<string, CachedResponse>()
  const inFlight = new Map<string, Promise<Response>>()

  function clear() {
    responses.clear()
  }

  async function refresh(request: Request, key: string) {
    const existing = inFlight.get(key)
    if (existing) return existing

    const pending = fetchImpl(request)
      .then((response) => {
        if (response.ok) {
          responses.set(key, { response: response.clone(), updatedAt: now() })
        }
        return response
      })
      .finally(() => {
        inFlight.delete(key)
      })

    inFlight.set(key, pending)
    return pending
  }

  async function cachedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const request = new Request(input, init)

    if (!isSupabaseRestRequest(request)) {
      return fetchImpl(request)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const response = await fetchImpl(request)
      if (response.ok) clear()
      return response
    }

    const key = requestCacheKey(request)
    const cached = responses.get(key)
    const age = cached ? now() - cached.updatedAt : Number.POSITIVE_INFINITY

    if (cached && age <= freshForMs) {
      return cached.response.clone()
    }

    if (cached && age <= staleForMs) {
      void refresh(request.clone(), key)
      return cached.response.clone()
    }

    const response = await refresh(request, key)
    return response.clone()
  }

  return {
    clear,
    fetch: cachedFetch,
    size: () => responses.size,
  }
}

let browserCache: ReturnType<typeof createSupabaseReadCache> | null = null

function getBrowserCache() {
  browserCache ??= createSupabaseReadCache()
  return browserCache
}

export function cachedSupabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof window === 'undefined') return fetch(input, init)
  return getBrowserCache().fetch(input, init)
}

export function clearSupabaseReadCache() {
  browserCache?.clear()
}

