import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { buildAlternates } from "@/lib/seo/alternates";
import { BreadcrumbJsonLd } from "@/components/seo";
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
    alternates: buildAlternates("/pricing", locale),
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
        description: "Stock watchlist briefings via Telegram with educational context",
      },
      {
        "@type": "Offer",
        name: "Pro Plan (Monthly)",
        price: monthlyPrice,
        priceCurrency: "USD",
        priceValidUntil: "2026-12-31",
        availability: "https://schema.org/InStock",
        description:
          "Full stocks and crypto watchlist briefings with signal labels, priority delivery, and Telegram follow-ups",
      },
      {
        "@type": "Offer",
        name: "Pro Plan (Annual)",
        price: annualPrice,
        priceCurrency: "USD",
        priceValidUntil: "2026-12-31",
        availability: "https://schema.org/InStock",
        description:
          "Full stocks and crypto watchlist briefings with signal labels, priority delivery, and Telegram follow-ups - Annual billing",
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BreadcrumbJsonLd
          locale={locale}
          items={[
            { name: "Home", path: "" },
            { name: "Pricing" },
          ]}
        />
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
