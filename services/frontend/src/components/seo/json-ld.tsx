import { PRICING } from "@/config/pricing";

const baseUrl = "https://stockandcryptotracker.com";

// Organization Schema
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Stock And Crypto Tracker",
  url: baseUrl,
  logo: `${baseUrl}/logo.png`,
  description:
    "AI-powered market analysis for stocks and crypto. Get clear signals without the noise, delivered directly to Telegram.",
  foundingDate: "2025",
  sameAs: ["https://t.me/StockAndCryptoAdvisorBot"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    email: "contact@stockandcryptotracker.com",
    availableLanguage: ["English", "Chinese"],
  },
};

// WebSite Schema
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Stock And Crypto Tracker",
  url: baseUrl,
  description:
    "AI-powered market analysis for stocks and crypto delivered via Telegram.",
  inLanguage: ["en", "zh"],
  publisher: {
    "@type": "Organization",
    name: "Stock And Crypto Tracker",
  },
};

// SoftwareApplication Schema (for the Telegram Bot)
const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Stock And Crypto Tracker Bot",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Telegram",
  description:
    "AI-powered market analysis bot for stocks and crypto. Get clear signals without the noise, delivered directly to your Telegram.",
  offers: [
    {
      "@type": "Offer",
      name: "Free Plan",
      price: "0",
      priceCurrency: PRICING.currency,
      description: "Limited daily analysis with delayed alerts",
    },
    {
      "@type": "Offer",
      name: "Pro Plan",
      price: PRICING.price,
      priceCurrency: PRICING.currency,
      priceValidUntil: PRICING.priceValidUntil,
      description: "Full stocks and crypto coverage with priority processing",
    },
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    ratingCount: "50",
  },
};

// HowTo Schema (for "How it Works" section)
const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Get AI-Powered Market Analysis",
  description:
    "Learn how Stock And Crypto Tracker delivers AI-powered market signals to your Telegram.",
  step: [
    {
      "@type": "HowToStep",
      name: "We monitor the market",
      text: "Our AI analyzes price action, volume, and technical patterns across stocks and crypto continuously.",
      position: 1,
    },
    {
      "@type": "HowToStep",
      name: "We detect meaningful setups",
      text: "Only when conditions matter. No constant spam - just actionable insights.",
      position: 2,
    },
    {
      "@type": "HowToStep",
      name: "You get clear context",
      text: "Receive signal type, time horizon, confidence level, and risk factors to watch.",
      position: 3,
    },
    {
      "@type": "HowToStep",
      name: "Delivered on Telegram",
      text: "Access everything via your Telegram account - no apps to download.",
      position: 4,
    },
  ],
  totalTime: "PT5M",
};

export function JsonLdSchemas() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(howToSchema),
        }}
      />
    </>
  );
}
