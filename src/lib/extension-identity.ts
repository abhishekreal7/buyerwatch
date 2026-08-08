export const BUYERWATCH_EXTENSION_ID = 'akfjpaggkndebeidadabipjpkbchlhfe'

export const BUYERWATCH_EXTENSION_ORIGIN = `chrome-extension://${BUYERWATCH_EXTENSION_ID}`

export function isAllowedBuyerWatchExtensionOrigin(
  origin: string | null,
  configuredOrigins = '',
  isProduction = process.env.NODE_ENV === 'production',
): origin is string {
  if (!origin) return false
  if (!isProduction && origin.startsWith('chrome-extension://')) return true

  const configured = configuredOrigins
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  return origin === BUYERWATCH_EXTENSION_ORIGIN || configured.includes(origin)
}
