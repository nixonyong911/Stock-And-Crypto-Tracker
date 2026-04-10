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
    "Personalized daily briefings for your stock and crypto watchlist—curated context and plain English, delivered on Telegram.",
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
    "Watchlist-first market briefings with curated news and plain-English updates via Telegram.",
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
    "Telegram bot for personalized stock and crypto watchlist briefings—plain English, curated context.",
  offers: [
    {
      "@type": "Offer",
      name: "Free Plan",
      price: "0",
      priceCurrency: PRICING.currency,
      description: "Stock coverage with delayed alerts",
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
};

// HowTo Schema (for "How it Works" section)
const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Get Watchlist Market Briefings",
  description:
    "Add your tickers, receive plain-English watchlist updates and curated context on Telegram.",
  step: [
    {
      "@type": "HowToStep",
      name: "Add your watchlist",
      text: "Tell the service which stocks and crypto you want to follow.",
      position: 1,
    },
    {
      "@type": "HowToStep",
      name: "We monitor for you",
      text: "Price action, setups, and narrative are tracked so you don't have to hunt across sites.",
      position: 2,
    },
    {
      "@type": "HowToStep",
      name: "You get a short update",
      text: "When it matters: what's happening, what to watch, horizon, confidence, and risk—in plain language.",
      position: 3,
    },
    {
      "@type": "HowToStep",
      name: "Read it in Telegram",
      text: "Updates are delivered to your Telegram account—no separate app required.",
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
