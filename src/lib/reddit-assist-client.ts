type AssistedReplyInput = {
  threadId: string
  text: string
  postUrl: string
  extensionInstalled: boolean
}

type BrowserGlobals = {
  window: {
    open: (url: string, target: string, features?: string) => { location: { replace: (url: string) => void } } | null
    clearTimeout: (id: ReturnType<typeof setTimeout>) => void
    setTimeout: typeof setTimeout
    addEventListener: (type: string, listener: (event: Event) => void) => void
    removeEventListener: (type: string, listener: (event: Event) => void) => void
    dispatchEvent: (event: Event) => boolean
  }
  navigator: {
    clipboard: { writeText: (text: string) => Promise<void> }
  }
}

export async function openRedditAssistedReply(
  input: AssistedReplyInput,
): Promise<'prefill' | 'copy'> {
  const browser = globalThis as unknown as BrowserGlobals
  const target = browser.window.open('about:blank', '_blank')
  const navigate = () => {
    if (target) target.location.replace(input.postUrl)
    else browser.window.open(input.postUrl, '_blank', 'noopener,noreferrer')
  }

  if (!input.extensionInstalled) {
    await browser.navigator.clipboard.writeText(input.text)
    navigate()
    return 'copy'
  }

  const ready = new Promise<boolean>((resolve) => {
    const onReady = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== input.threadId) return
      browser.window.clearTimeout(timeout)
      browser.window.removeEventListener('buyerwatch:prefill-ready', onReady)
      resolve(true)
    }
    const timeout = browser.window.setTimeout(() => {
      browser.window.removeEventListener('buyerwatch:prefill-ready', onReady)
      resolve(false)
    }, 1_200)
    browser.window.addEventListener('buyerwatch:prefill-ready', onReady)
  })

  browser.window.dispatchEvent(new CustomEvent('buyerwatch:prefill-reddit', {
    detail: JSON.stringify(input),
  }))

  if (await ready) {
    // Keep a clipboard fallback even if Reddit changes its composer markup.
    await browser.navigator.clipboard.writeText(input.text).catch(() => undefined)
    navigate()
    return 'prefill'
  }

  await browser.navigator.clipboard.writeText(input.text)
  navigate()
  return 'copy'
}
