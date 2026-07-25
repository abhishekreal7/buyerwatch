const ATTRIBUTION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{6,64}$/

export function assertAttributionToken(token: string): string {
  if (!ATTRIBUTION_TOKEN_PATTERN.test(token)) {
    throw new Error('Invalid attribution token')
  }
  return token
}

export function buildAttributionShortUrl(appUrl: string, token: string): string {
  const safeToken = assertAttributionToken(token)
  const url = new URL(appUrl)
  url.pathname = `${url.pathname.replace(/\/$/, '')}/r/${safeToken}`.replace(/\/{2,}/g, '/')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export function buildAttributionDestinationUrl(businessUrl: string, token: string): string {
  const safeToken = assertAttributionToken(token)
  const url = new URL(businessUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid attribution destination')
  }
  url.searchParams.set('ref', 'scouto')
  url.searchParams.set('sid', safeToken)
  return url.toString()
}
