'use client'

async function copyReplyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // Clipboard API access can be denied by browser permissions. Keep the
    // legacy copy path as a user-gesture fallback for manual delivery.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  try {
    textarea.select()
    if (!document.execCommand('copy')) {
      throw new Error('Unable to copy reply')
    }
  } finally {
    textarea.remove()
  }
}

export async function copyAndOpenRedditReply(input: {
  text: string
  postUrl: string
}): Promise<void> {
  const url = new URL(input.postUrl)
  const hostname = url.hostname.toLowerCase()
  if (
    url.protocol !== 'https:'
    || !(hostname === 'reddit.com' || hostname.endsWith('.reddit.com'))
  ) {
    throw new Error('Invalid Reddit post URL')
  }

  // Open synchronously while the click still carries a user gesture. Passing
  // `noopener` in the feature string can make window.open() return null even
  // when the browser opened a tab, which would otherwise trigger a duplicate
  // navigation fallback.
  const opened = window.open('about:blank', '_blank')
  if (opened) opened.opener = null

  try {
    await copyReplyText(input.text)
  } catch (error) {
    opened?.close()
    throw error
  }

  if (opened) {
    opened.location.replace(url.toString())
  } else {
    window.location.assign(url.toString())
  }
}
