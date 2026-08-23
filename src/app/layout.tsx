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
  title: "BuyerWatch | Premium Lead Generation",
  description: "Advanced signal intelligence and reply automation.",
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
  await headers()

  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakarta.variable} ${playfair.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-text-primary antialiased" suppressHydrationWarning>
        <MotionProvider>
          {children}
        </MotionProvider>
        <Analytics />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
