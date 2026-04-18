import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header, Footer } from "@/components/layout";
import { BreadcrumbJsonLd } from "@/components/seo";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buildAlternates } from "@/lib/seo/alternates";
import {
  getAllActiveSymbols,
  getTickerInfo,
  getLatestPriceTarget,
  getRecentPriceTargets,
} from "@/lib/db/tickers";
import { locales } from "@/lib/i18n/config";
import { TickerContent } from "./ticker-content";

export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    const symbols = await getAllActiveSymbols();
    return locales.flatMap((locale) =>
      symbols.map((s) => ({
        locale,
        symbol: s.symbol,
      }))
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; symbol: string }>;
}): Promise<Metadata> {
  const { locale, symbol } = await params;
  const ticker = await getTickerInfo(symbol);

  if (!ticker) {
    return { title: "Ticker Not Found" };
  }

  const t = await getTranslations({ locale, namespace: "tickerPage" });
  const nameOrSymbol = ticker.name ?? ticker.symbol;
  const titleKey =
    ticker.assetType === "crypto" ? "meta.titleCrypto" : "meta.titleStock";
  const descKey =
    ticker.assetType === "crypto"
      ? "meta.descriptionCrypto"
      : "meta.descriptionStock";

  const title = t(titleKey, { symbol: ticker.symbol, name: nameOrSymbol });
  const description = t(descKey, {
    symbol: ticker.symbol,
    name: nameOrSymbol,
  });

  const latest = await getLatestPriceTarget(ticker.symbol);
  const ogParams = new URLSearchParams({
    symbol: ticker.symbol,
    name: nameOrSymbol,
    signal: latest?.signalSummary ?? "Neutral",
    type: ticker.assetType,
    ...(latest && { price: latest.latestClose.toString() }),
    ...(latest?.confidence && {
      confidence: Math.round(latest.confidence * 100).toString(),
    }),
  });

  const ogImage = {
    url: `/og/ticker?${ogParams.toString()}`,
    width: 1200,
    height: 630,
    alt: `${ticker.symbol} analysis signal`,
  };

  return {
    title,
    description,
    keywords: [
      `${ticker.symbol} analysis`,
      `${ticker.symbol} signal`,
      `${ticker.symbol} price target`,
      ticker.assetType === "crypto"
        ? `${ticker.symbol} crypto`
        : `${ticker.symbol} stock`,
      "AI market analysis",
      "daily briefing",
    ],
    openGraph: {
      title,
      description,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url],
    },
    alternates: buildAlternates(`/ticker/${ticker.symbol}`, locale),
  };
}

const baseUrl = "https://stockandcryptotracker.com";

type Props = {
  params: Promise<{ locale: string; symbol: string }>;
};

export default async function TickerPage({ params }: Props) {
  const { locale, symbol } = await params;
  setRequestLocale(locale);

  const ticker = await getTickerInfo(symbol);
  if (!ticker) notFound();

  const [latest, history] = await Promise.all([
    getLatestPriceTarget(ticker.symbol),
    getRecentPriceTargets(ticker.symbol, 7),
  ]);

  const t = await getTranslations({ locale, namespace: "tickerPage" });

  const nameLabel = ticker.name ?? ticker.symbol;
  const assetLabel = ticker.assetType === "crypto" ? "crypto" : "stock";
  const signalText = latest?.signalSummary ?? "Neutral";
  const confText = latest?.confidence
    ? `${Math.round(latest.confidence * 100)}%`
    : "not yet available";
  const priceText = latest
    ? `$${latest.latestClose.toLocaleString()}`
    : "not yet available";

  const tickerFaqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What is the current signal for ${ticker.symbol}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The latest AI-generated signal for ${ticker.symbol} (${nameLabel}) is "${signalText}" with ${confText} confidence. This signal is updated daily based on technical analysis.`,
        },
      },
      {
        "@type": "Question",
        name: `What is the price target for ${ticker.symbol}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: latest?.targetPrice
            ? `The current price target for ${ticker.symbol} is $${latest.targetPrice.toLocaleString()}, with an entry price of ${latest.entryPrice ? `$${latest.entryPrice.toLocaleString()}` : "N/A"} and a stop-loss at ${latest.stopLoss ? `$${latest.stopLoss.toLocaleString()}` : "N/A"}. These levels are computed daily using a technical composite method.`
            : `Price targets for ${ticker.symbol} are updated daily. Check back for the latest entry, target, and stop-loss levels.`,
        },
      },
      {
        "@type": "Question",
        name: `How do I get ${ticker.symbol} alerts?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Add ${ticker.symbol} to your watchlist on Stock And Crypto Tracker's Telegram bot (@StockAndCryptoAdvisorBot). You'll receive personalized daily briefings covering signal, confidence, risk, and what to watch — all in plain English.`,
        },
      },
      {
        "@type": "Question",
        name: `Is ${ticker.symbol} a ${assetLabel}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${ticker.symbol} (${nameLabel}) is tracked as a ${assetLabel}${ticker.exchange ? ` on ${ticker.exchange}` : ""}. The latest closing price is ${priceText}.`,
        },
      },
    ],
  };

  const finProductSchema = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: `${ticker.symbol} Analysis`,
    description: `AI-powered daily signal and price targets for ${ticker.symbol} (${nameLabel})`,
    url: `${baseUrl}/${locale}/ticker/${ticker.symbol}`,
    provider: {
      "@type": "Organization",
      name: "Stock And Crypto Tracker",
      url: baseUrl,
    },
    ...(latest && {
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free daily signal available. Pro plan for full analysis.",
        availability: "https://schema.org/InStock",
      },
    }),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BreadcrumbJsonLd
          locale={locale}
          items={[
            { name: t("breadcrumbs.home"), path: "" },
            { name: t("breadcrumbs.tickers"), path: "/ticker/AAPL" },
            { name: ticker.symbol },
          ]}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(finProductSchema),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(tickerFaqSchema),
          }}
        />

        <section className="border-b bg-muted/30 py-4">
          <div className="container mx-auto max-w-4xl px-4">
            <Breadcrumbs
              items={[
                { label: t("breadcrumbs.home"), href: "/" },
                { label: t("breadcrumbs.tickers") },
                { label: ticker.symbol },
              ]}
            />
          </div>
        </section>

        <TickerContent ticker={ticker} latest={latest} history={history} />
      </main>
      <Footer />
    </div>
  );
}
