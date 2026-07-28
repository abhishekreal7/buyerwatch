import type { Metadata } from "next";
import { Inter, Geist_Mono, Plus_Jakarta_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import MotionProvider from "@/components/MotionProvider";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/CommandPalette";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <CommandPalette />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
