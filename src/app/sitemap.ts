import type { MetadataRoute } from 'next'

const publicRoutes = [
  '/',
  '/about',
  '/pricing',
  '/contact',
  '/privacy',
  '/terms',
  '/service-policy',
  '/status',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.buyerwatch.co').replace(/\/$/, '')
  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : route === '/pricing' ? 0.9 : 0.6,
  }))
}
