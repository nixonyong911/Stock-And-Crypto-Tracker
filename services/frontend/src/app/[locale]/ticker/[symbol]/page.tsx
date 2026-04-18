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

  const finProductSchema = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: `${ticker.symbol} Analysis`,
    description: `AI-powered daily signal and price targets for ${ticker.symbol}${ticker.name ? ` (${ticker.name})` : ""}`,
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
