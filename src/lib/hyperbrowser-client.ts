const HYPERBROWSER_API_URL = 'https://api.hyperbrowser.ai/api/'
const REQUEST_TIMEOUT_MS = 30_000
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504])

export class HyperbrowserClientError extends Error {
  public readonly statusCode?: number
  public readonly retryable: boolean
  public readonly requestId?: string

  constructor(
    message: string,
    statusCode?: number,
    retryable = false,
    requestId?: string,
  ) {
    super(message)
    this.name = 'HyperbrowserClientError'
    this.statusCode = statusCode
    this.retryable = retryable
    this.requestId = requestId
  }
}

export type HyperbrowserSession = {
  id: string
  wsEndpoint?: string
  liveUrl?: string
  status?: string
  launchState?: { profile?: { id?: string } }
}

type HyperbrowserProfile = { id: string }

export type HyperbrowserCreditInfo = {
  usage: number
  limit: number
  remaining: number
}

/**
 * The official SDK currently pins a legacy transport that calls Node's
 * deprecated url.parse API. BuyerWatch only needs these five control-plane operations, so
 * use the platform fetch implementation and keep the provider contract local.
 */
export class HyperbrowserClient {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = new URL(path.replace(/^\/+/, ''), HYPERBROWSER_API_URL)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'x-api-key': this.apiKey,
          'content-type': 'application/json',
          ...init?.headers,
        },
      })
      const requestId = response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? undefined
      if (!response.ok) {
        const body = await response.json().catch(() => null) as Record<string, unknown> | null
        const message = typeof body?.message === 'string'
          ? body.message
          : typeof body?.error === 'string'
            ? body.error
            : `HTTP error! status: ${response.status}`
        throw new HyperbrowserClientError(
          message,
          response.status,
          RETRYABLE_STATUS_CODES.has(response.status),
          requestId,
        )
      }
      if (response.status === 204 || response.headers.get('content-length') === '0') return {} as T
      return await response.json() as T
    } catch (error) {
      if (error instanceof HyperbrowserClientError) throw error
      const retryable = error instanceof Error && (error.name === 'AbortError' || error.name === 'TypeError')
      throw new HyperbrowserClientError(
        error instanceof Error ? error.message : 'Hyperbrowser request failed',
        undefined,
        retryable,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  createProfile(name: string): Promise<HyperbrowserProfile> {
    return this.request('/profile', { method: 'POST', body: JSON.stringify({ name }) })
  }

  deleteProfile(id: string): Promise<unknown> {
    return this.request(`/profile/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  createSession(options: Record<string, unknown>): Promise<HyperbrowserSession> {
    return this.request('/session', { method: 'POST', body: JSON.stringify(options) })
  }

  getSession(id: string, options: { liveViewTtlSeconds?: number } = {}): Promise<HyperbrowserSession> {
    const query = new URLSearchParams()
    if (options.liveViewTtlSeconds !== undefined) {
      query.set('liveViewTtlSeconds', String(options.liveViewTtlSeconds))
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    return this.request(`/session/${encodeURIComponent(id)}${suffix}`)
  }

  stopSession(id: string): Promise<unknown> {
    return this.request(`/session/${encodeURIComponent(id)}/stop`, { method: 'PUT' })
  }

  async listActiveSessions(): Promise<HyperbrowserSession[]> {
    const res = await this.request<{ sessions?: HyperbrowserSession[] }>('/sessions?status=active').catch(() => null)
    return res?.sessions ?? []
  }

  async stopAllActiveSessions(): Promise<void> {
    const active = await this.listActiveSessions().catch(() => [])
    await Promise.allSettled(active.map(s => this.stopSession(s.id)))
  }

  getCreditInfo(): Promise<HyperbrowserCreditInfo> {
    return this.request('/team/credit-info')
  }
}
