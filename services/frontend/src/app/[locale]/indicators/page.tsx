import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import {
  getEconomicIndicators,
  groupIndicatorsByCategory,
  getSortedCategories,
  CATEGORY_CONFIG,
  EconomicIndicator,
} from "@/lib/db/indicators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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
};

function formatValue(value: number | null, units: string | null): string {
  if (value === null) return "N/A";

  // Format based on units
  if (units === "Percent") {
    return `${value.toFixed(2)}%`;
  }
  if (units === "Billions USD") {
    return `$${(value / 1000).toFixed(1)}T`;
  }
  if (units === "Millions USD") {
    return `$${(value / 1000000).toFixed(2)}T`;
  }
  if (units === "Index") {
    return value.toFixed(2);
  }
  return value.toLocaleString();
}

function TrendIcon({ trend }: { trend: EconomicIndicator["trend"] }) {
  if (trend === "up") {
    return <TrendingUp className="h-4 w-4 text-green-500" />;
  }
  if (trend === "down") {
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  }
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function SignalBadge({ signal }: { signal: EconomicIndicator["current_signal"] }) {
  if (signal === "bullish") {
    return (
      <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
        Bullish
      </Badge>
    );
  }
  if (signal === "bearish") {
    return (
      <Badge variant="default" className="bg-red-500/10 text-red-600 hover:bg-red-500/20">
        Bearish
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      Neutral
    </Badge>
  );
}

function IndicatorCard({ indicator }: { indicator: EconomicIndicator }) {
  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          {indicator.display_name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-2xl font-bold">
            {formatValue(indicator.current_value, indicator.units)}
          </span>
          <TrendIcon trend={indicator.trend} />
        </div>
        <div className="flex items-center justify-between">
          <SignalBadge signal={indicator.current_signal} />
          {indicator.current_observation_date && (
            <span className="text-xs text-muted-foreground">
              {new Date(indicator.current_observation_date).toLocaleDateString()}
            </span>
          )}
        </div>
        {indicator.description && (
          <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
            {indicator.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function IndicatorsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "indicatorsPage" });

  let indicators: EconomicIndicator[] = [];
  let error: string | null = null;

  try {
    indicators = await getEconomicIndicators();
  } catch (e) {
    console.error("Failed to fetch indicators:", e);
    error = "Failed to load economic indicators";
  }

  const grouped = groupIndicatorsByCategory(indicators);
  const sortedCategories = getSortedCategories(grouped);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="border-b bg-muted/30 py-16">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              {t("hero.subtitle")}
            </p>
          </div>
        </section>

        {/* Indicators Grid */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            {error ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">{error}</p>
              </div>
            ) : indicators.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">{t("noData")}</p>
              </div>
            ) : (
              <div className="space-y-12">
                {sortedCategories.map((category) => (
                  <div key={category}>
                    <h2 className="text-2xl font-semibold mb-6">
                      {CATEGORY_CONFIG[category]?.displayName ?? category}
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {grouped[category].map((indicator) => (
                        <IndicatorCard
                          key={indicator.series_id}
                          indicator={indicator}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
