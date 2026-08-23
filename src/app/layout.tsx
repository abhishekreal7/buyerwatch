import type { Metadata } from "next";
import { headers } from 'next/headers'
import { Inter, Geist_Mono, Plus_Jakarta_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import MotionProvider from "@/components/MotionProvider";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: 'swap',
});

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.buyerwatch.co'),
  title: {
    default: 'Reddit Lead Generation & Intent Monitoring | BuyerWatch',
    template: '%s | BuyerWatch',
  },
  description: 'Find high-intent Reddit and Bluesky conversations, score buyer signals, and prepare helpful replies for human review with BuyerWatch.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: 'https://www.buyerwatch.co/',
    siteName: 'BuyerWatch',
    title: 'Reddit Lead Generation & Intent Monitoring | BuyerWatch',
    description: 'Find high-intent conversations and prepare thoughtful replies before the opportunity passes.',
    images: [{ url: '/buyerwatch_logo.png', width: 512, height: 512, alt: 'BuyerWatch' }],
  },
  twitter: {
    card: 'summary',
    title: 'Reddit Lead Generation & Intent Monitoring | BuyerWatch',
    description: 'Find high-intent conversations and prepare thoughtful replies with BuyerWatch.',
    images: ['/buyerwatch_logo.png'],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: '/buyerwatch-favicon.svg?v=6', type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: [{ url: '/buyerwatch-favicon.svg?v=6', type: 'image/svg+xml' }],
    apple: [{ url: '/buyerwatch-icon.png?v=3', type: 'image/png', sizes: '128x128' }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Strict CSP nonces are generated in proxy.ts. Reading the request headers
  // forces dynamic rendering so Next.js can attach that nonce to its scripts.
  const requestHeaders = await headers()
  const nonce = requestHeaders.get('x-nonce') ?? undefined
  const softwareApplication = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'BuyerWatch',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://www.buyerwatch.co/',
    description: 'A social intent monitoring and reply-drafting platform for finding relevant Reddit and Bluesky conversations.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      category: 'Free plan',
      url: 'https://www.buyerwatch.co/pricing',
    },
  }

  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakarta.variable} ${playfair.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-text-primary antialiased" suppressHydrationWarning>
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
        />
        <MotionProvider>
          {children}
        </MotionProvider>
        <Analytics />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
