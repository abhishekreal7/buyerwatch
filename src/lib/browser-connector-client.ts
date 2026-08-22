export const BUYERWATCH_CONNECTOR_ID = 'akfjpaggkndebeidadabipjpkbchlhfe'

type ConnectorResponse = {
  success?: boolean
  error?: string
  username?: string
  version?: string
}

type ChromeRuntime = {
  lastError?: { message?: string }
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: ConnectorResponse) => void,
  ) => void
}

function runtime(): ChromeRuntime | null {
  const candidate = (globalThis as unknown as {
    chrome?: { runtime?: ChromeRuntime }
  }).chrome?.runtime
  return typeof candidate?.sendMessage === 'function' ? candidate : null
}

export function sendBuyerWatchConnectorMessage(
  message: unknown,
  timeoutMs = 20_000,
): Promise<ConnectorResponse | null> {
  const chromeRuntime = runtime()
  if (!chromeRuntime) return Promise.resolve(null)
  return new Promise(resolve => {
    let settled = false
    const finish = (value: ConnectorResponse | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    try {
      chromeRuntime.sendMessage(BUYERWATCH_CONNECTOR_ID, message, response => {
        finish(chromeRuntime.lastError || !response ? null : response)
      })
    } catch {
      finish(null)
    }
  })
}

export async function connectRedditThroughChrome(): Promise<ConnectorResponse | null> {
  return sendBuyerWatchConnectorMessage({ type: 'BUYERWATCH_CONNECT_REDDIT' })
}
