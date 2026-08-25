export type OnboardingKeyword = {
  term: string
  platform: string
  target: string
}

export type OnboardingData = {
  business_name: string
  business_description: string
  business_url: string
  business_type: string
  writing_style: string
  reddit_username: string
  keywords: OnboardingKeyword[]
}

const BUSINESS_TYPES = new Set([
  'saas',
  'ecommerce',
  'agency',
  'freelancer',
  'creator',
  'coach',
  'physical_product',
  'other',
])

const ALLOWED_PLATFORMS = new Set(['reddit', 'bluesky', 'x'])

export function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function normalizeRedditUsername(value: string): string {
  return value.trim().replace(/^u\//i, '')
}

export function validateRedditUsername(value: string): string | null {
  const username = normalizeRedditUsername(value)
  if (!username) return null
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) {
    return 'Enter a valid Reddit username using 3–20 letters, numbers, hyphens, or underscores.'
  }
  return null
}

export function validateProductContext(input: {
  businessName: string
  businessDescription: string
}): string | null {
  const businessName = input.businessName.trim()
  const description = input.businessDescription.trim()
  if (!businessName) return 'Enter your business name before continuing.'
  if (businessName.length > 120) return 'Business name must be 120 characters or fewer.'
  if (description.length < 12) return 'Add a short description of the problem your product solves.'
  if (description.length > 5000) return 'Product description is too long.'
  return null
}

export function validateWebsiteUrl(value: string): string | null {
  const websiteValue = normalizeWebsiteUrl(value)
  if (!websiteValue) return null
  if (websiteValue.length > 2048) return 'Website URL is too long.'
  try {
    const website = new URL(websiteValue)
    if (!['http:', 'https:'].includes(website.protocol) || website.username || website.password) {
      return 'Enter a valid public website URL.'
    }
  } catch {
    return 'Enter a valid public website URL.'
  }
  return null
}

export function validateOnboardingData(data: OnboardingData): string | null {
  const productError = validateProductContext({
    businessName: data.business_name,
    businessDescription: data.business_description,
  })
  if (productError) return productError

  const websiteError = validateWebsiteUrl(data.business_url)
  if (websiteError) return websiteError
  if (data.writing_style?.trim().length > 2000) return 'Writing style is too long.'
  const redditUsernameError = validateRedditUsername(data.reddit_username)
  if (redditUsernameError) return redditUsernameError
  if (!BUSINESS_TYPES.has(data.business_type)) return 'Select a valid business category.'
  if (!Array.isArray(data.keywords) || data.keywords.length === 0) {
    return 'Add at least one monitoring rule before launching.'
  }
  if (data.keywords.length > 50) return 'Too many monitoring rules were selected.'

  const invalidKeyword = data.keywords.some(keyword => (
    !keyword
    || typeof keyword.term !== 'string'
    || typeof keyword.target !== 'string'
    || typeof keyword.platform !== 'string'
    || !keyword.term.trim()
    || !keyword.target.trim()
    || keyword.term.trim().length > 200
    || keyword.target.trim().length > 200
    || !ALLOWED_PLATFORMS.has(keyword.platform)
    || (keyword.platform === 'reddit' && !/^[A-Za-z0-9_]{2,21}$/.test(keyword.target.trim().replace(/^r\//i, '')))
  ))
  return invalidKeyword
    ? 'One or more monitoring rules are invalid. Go back and review your selections.'
    : null
}
