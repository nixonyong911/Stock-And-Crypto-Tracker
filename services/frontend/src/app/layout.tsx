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
    default: "Stock And Crypto Tracker - Daily Briefing for Your Watchlist",
    template: "%s | Stock And Crypto Tracker",
  },
  description:
    "One personalized daily briefing for the stocks and crypto you follow—watchlist context, curated news, plain English. Save time; updates in Telegram.",
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
    title: "Stock And Crypto Tracker - Daily Briefing for Your Watchlist",
    description:
      "Personalized watchlist briefings with curated news and plain-English market context. Delivered on Telegram.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Stock And Crypto Tracker - Watchlist market briefings",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "Stock And Crypto Tracker - Daily Briefing for Your Watchlist",
    description:
      "Personalized watchlist briefings with curated news and plain-English market context. Delivered on Telegram.",
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

  // Icons
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
