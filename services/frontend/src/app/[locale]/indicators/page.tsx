import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import {
  getEconomicIndicators,
  getReleaseCalendar,
  EconomicIndicator,
  ReleaseCalendarEntry,
} from "@/lib/db/indicators";
import {
  ViewToggle,
  DataToggle,
  CompactView,
  DetailView,
  IndicatorsLayout,
} from "./components";
import { createValueFormatter, DataMode } from "./lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "indicatorsPage" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: [
      "economic indicators",
      "fed funds rate",
      "inflation",
      "treasury yields",
      "market sentiment",
    ],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
  };
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; data?: string }>;
};

export default async function IndicatorsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { view = "compact", data = "media" } = await searchParams;

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "indicatorsPage" });

  // Fetch data in parallel
  let indicators: EconomicIndicator[] = [];
  let releases: ReleaseCalendarEntry[] = [];
  let error: string | null = null;

  try {
    [indicators, releases] = await Promise.all([
      getEconomicIndicators(),
      getReleaseCalendar(),
    ]);
  } catch (e) {
    console.error("Failed to fetch data:", e);
    error = "Failed to load economic indicators";
  }

  const dataMode = (data === "raw" ? "raw" : "media") as DataMode;
  const formatValue = createValueFormatter(dataMode);
  const currentView = view === "detail" ? "detail" : "compact";

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="border-b bg-muted/30 py-12">
          <div className="container mx-auto px-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {t("hero.title")}
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {t("hero.subtitle")}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Suspense
                  fallback={
                    <div className="h-9 w-32 bg-muted animate-pulse rounded-lg" />
                  }
                >
                  <ViewToggle />
                </Suspense>
                <Suspense
                  fallback={
                    <div className="h-6 w-20 bg-muted animate-pulse rounded" />
                  }
                >
                  <DataToggle />
                </Suspense>
              </div>
            </div>
          </div>
        </section>

        {/* Indicators Content */}
        {error ? (
          <div className="container mx-auto px-4 py-12 text-center">
            <p className="text-muted-foreground">{error}</p>
          </div>
        ) : indicators.length === 0 ? (
          <div className="container mx-auto px-4 py-12 text-center">
            <p className="text-muted-foreground">{t("noData")}</p>
          </div>
        ) : (
          <IndicatorsLayout releases={releases}>
            {currentView === "compact" ? (
              <CompactView indicators={indicators} formatValue={formatValue} />
            ) : (
              <DetailView indicators={indicators} formatValue={formatValue} />
            )}
          </IndicatorsLayout>
        )}
      </main>
      <Footer />
    </div>
  );
}
