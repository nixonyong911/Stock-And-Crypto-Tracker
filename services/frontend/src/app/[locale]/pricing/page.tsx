import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { PricingContent } from "./pricing-content";
import { getStripePrices } from "@/lib/stripe/prices";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricingPage" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: [
      "stock tracker pricing",
      "crypto tracker pricing",
      "AI market analysis cost",
      "telegram bot subscription",
      "stock alerts pricing",
    ],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Fetch prices from Stripe (cached 1 hour)
  const prices = await getStripePrices();

  // Build dynamic SEO schema with fetched prices
  const monthlyPrice = prices.monthly
    ? (prices.monthly.unitAmount / 100).toFixed(2)
    : "19.99";
  const annualPrice = prices.annual
    ? (prices.annual.unitAmount / 100).toFixed(2)
    : "167.99";

  const pricingSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Stock And Crypto Tracker",
    description:
      "AI-powered market analysis for stocks and crypto delivered via Telegram",
    brand: {
      "@type": "Brand",
      name: "Stock And Crypto Tracker",
    },
    offers: [
      {
        "@type": "Offer",
        name: "Free Plan",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        description: "Stock coverage with delayed alerts",
      },
      {
        "@type": "Offer",
        name: "Pro Plan (Monthly)",
        price: monthlyPrice,
        priceCurrency: "USD",
        priceValidUntil: "2026-12-31",
        availability: "https://schema.org/InStock",
        description:
          "Full stocks and crypto coverage with priority processing and real-time alerts",
      },
      {
        "@type": "Offer",
        name: "Pro Plan (Annual)",
        price: annualPrice,
        priceCurrency: "USD",
        priceValidUntil: "2026-12-31",
        availability: "https://schema.org/InStock",
        description:
          "Full stocks and crypto coverage with priority processing and real-time alerts - Annual billing",
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(pricingSchema),
          }}
        />
        <PricingContent prices={prices} />
      </main>
      <Footer />
    </div>
  );
}
