import type { Metadata, Viewport } from "next";
import "./globals.css";

const baseUrl = "https://stockandcryptotracker.com";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Stock And Crypto Tracker - AI-Powered Market Clarity",
    template: "%s | Stock And Crypto Tracker",
  },
  description:
    "AI-powered market analysis for stocks and crypto. Get clear signals without the noise, delivered directly to Telegram. Free to start.",
  keywords: [
    "stock tracker",
    "crypto tracker",
    "AI market analysis",
    "stock alerts",
    "crypto alerts",
    "telegram bot",
    "market signals",
    "technical analysis",
    "stock market",
    "cryptocurrency",
  ],
  authors: [{ name: "Stock And Crypto Tracker" }],
  creator: "Stock And Crypto Tracker",
  publisher: "Stock And Crypto Tracker",

  // Open Graph
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: "zh_CN",
    url: baseUrl,
    siteName: "Stock And Crypto Tracker",
    title: "Stock And Crypto Tracker - AI-Powered Market Clarity",
    description:
      "AI-powered market analysis for stocks and crypto. Get clear signals without the noise, delivered directly to Telegram.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Stock And Crypto Tracker - AI-Powered Market Analysis",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "Stock And Crypto Tracker - AI-Powered Market Clarity",
    description:
      "AI-powered market analysis for stocks and crypto. Get clear signals without the noise, delivered directly to Telegram.",
    images: ["/og-image.png"],
  },

  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },

  // Alternate languages
  alternates: {
    canonical: baseUrl,
    languages: {
      en: "/en",
      zh: "/zh",
    },
  },

  // Additional meta
  category: "Finance",
  applicationName: "Stock And Crypto Tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
