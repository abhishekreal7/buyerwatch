const configuredSupportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()

export const SUPPORT_EMAIL =
  configuredSupportEmail && configuredSupportEmail !== 'support@example.com'
    ? configuredSupportEmail
    : 'support@buyerwatch.co'
