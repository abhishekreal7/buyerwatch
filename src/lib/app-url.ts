export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    || process.env.VERCEL_URL?.trim()
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  if (process.env.NODE_ENV === 'production') {
    throw new Error('No application URL is available in production')
  }
  return 'http://localhost:3000'
}
