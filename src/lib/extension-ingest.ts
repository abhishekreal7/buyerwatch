import { createHash } from 'node:crypto'

export type ExtensionPlatform = 'reddit' | 'bluesky' | 'x'

const PLATFORM_HOSTS: Record<ExtensionPlatform, RegExp> = {
  reddit: /(^|\.)reddit\.com$/i,
  bluesky: /(^|\.)bsky\.app$/i,
  x: /(^|\.)(x\.com|twitter\.com)$/i,
}

export function isExtensionPlatform(value: unknown): value is ExtensionPlatform {
  return value === 'reddit' || value === 'bluesky' || value === 'x'
}

export function isValidExtensionSourceUrl(
  platform: ExtensionPlatform,
  sourceUrl: string,
): boolean {
  try {
    const parsed = new URL(sourceUrl)
    return parsed.protocol === 'https:' && PLATFORM_HOSTS[platform].test(parsed.hostname)
  } catch {
    return false
  }
}

export function buildExtensionExternalId(
  platform: ExtensionPlatform,
  sourceEventId: string,
): string {
  return `${platform}:extension:${sourceEventId}`
}

export function buildExtensionScoreJobId(userId: string, externalId: string): string {
  const safeId = createHash('sha256').update(externalId).digest('hex').slice(0, 32)
  return `score-${userId}-${safeId}`
}

