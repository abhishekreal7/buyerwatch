import type { Session } from '@supabase/supabase-js'
import { BUYERWATCH_EXTENSION_ID as PACKAGED_EXTENSION_ID } from './extension-identity'

const configuredExtensionId = process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID?.trim()

export const BUYERWATCH_EXTENSION_ID = configuredExtensionId
  && /^[a-p]{32}$/.test(configuredExtensionId)
  ? configuredExtensionId
  : PACKAGED_EXTENSION_ID

type ExternalMessageResponse = {
  success?: boolean
  error?: string
  threadId?: string
  version?: string
}

type ChromeRuntime = {
  lastError?: { message?: string }
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: ExternalMessageResponse) => void,
  ) => void
}

function getChromeRuntime(): ChromeRuntime | null {
  const runtime = (globalThis as unknown as {
    chrome?: { runtime?: ChromeRuntime }
  }).chrome?.runtime
  return typeof runtime?.sendMessage === 'function' ? runtime : null
}

export function sendBuyerWatchExtensionMessage(
  message: unknown,
  timeoutMs = 1_200,
): Promise<ExternalMessageResponse | null> {
  const runtime = getChromeRuntime()
  if (!runtime) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: ExternalMessageResponse | null) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timer)
      resolve(value)
    }
    const timer = globalThis.setTimeout(() => finish(null), timeoutMs)

    try {
      runtime.sendMessage(BUYERWATCH_EXTENSION_ID, message, (response) => {
        const failed = Boolean(runtime.lastError)
        finish(failed || !response ? null : response)
      })
    } catch {
      finish(null)
    }
  })
}

export async function detectBuyerWatchExtension(): Promise<boolean> {
  const response = await sendBuyerWatchExtensionMessage({
    type: 'BUYERWATCH_EXTENSION_PING',
  })
  return response?.success === true
}

export async function syncBuyerWatchExtensionSession(
  session: Session,
  userId: string,
): Promise<boolean> {
  if (session.user.id !== userId) return false
  const response = await sendBuyerWatchExtensionMessage({
    type: 'BUYERWATCH_EXTENSION_SESSION',
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: {
        id: session.user.id,
        email: session.user.email,
      },
    },
  })
  return response?.success === true
}

export async function prepareBuyerWatchRedditReply(reply: {
  threadId: string
  text: string
  postUrl: string
}): Promise<boolean> {
  const response = await sendBuyerWatchExtensionMessage({
    type: 'BUYERWATCH_PREPARE_REPLY',
    reply,
  })
  return response?.success === true && response.threadId === reply.threadId
}
