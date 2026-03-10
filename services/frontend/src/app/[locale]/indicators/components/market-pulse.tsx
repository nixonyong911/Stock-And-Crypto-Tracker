import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { EconomicIndicator } from "@/lib/db/indicators";
import { formatValue, formatChange, formatDisplayName } from "../lib/format";
import { TrendIcon } from "./trend-icon";
import { cn } from "@/lib/utils";

const PINNED_PICKS: { seriesId: string; category: string; label: string }[] = [
  { seriesId: "DFEDTARU", category: "interest_rates", label: "Fed Rate" },
  { seriesId: "CPIAUCSL", category: "inflation", label: "CPI (YoY)" },
  { seriesId: "UNRATE", category: "labor", label: "Unemployment" },
  { seriesId: "A191RL1Q225SBEA", category: "growth", label: "GDP Growth" },
];

interface Props {
  indicators: EconomicIndicator[];
  releaseMap: Map<string, string | null>;
}

function findIndicator(
  indicators: EconomicIndicator[],
  pick: (typeof PINNED_PICKS)[number]
): EconomicIndicator | undefined {
  return (
    indicators.find((i) => i.series_id === pick.seriesId) ??
    indicators.find((i) => i.category === pick.category)
  );
}

export function MarketPulse({ indicators, releaseMap }: Props) {
  const t = useTranslations("indicators");

  const pinned = PINNED_PICKS.map((pick) => ({
    pick,
    indicator: findIndicator(indicators, pick),
  })).filter(
    (p): p is { pick: (typeof PINNED_PICKS)[number]; indicator: EconomicIndicator } =>
      p.indicator !== undefined
  );

  if (pinned.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">{t("marketPulse.title")}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {pinned.map(({ pick, indicator }) => {
          const value = formatValue(indicator);
          const change = formatChange(indicator);
          const nextRelease = releaseMap.get(indicator.series_id);

          return (
            <Card key={indicator.series_id} className="relative overflow-hidden">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  {pick.label}
                </p>
                <p className="text-2xl font-bold font-mono tracking-tight">
                  {value}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <TrendIcon trend={indicator.trend} className="h-3.5 w-3.5" />
                  <span
                    className={cn(
                      "text-sm",
                      change === "stable"
                        ? "text-muted-foreground"
                        : indicator.trend === "up"
                          ? "text-green-600"
                          : indicator.trend === "down"
                            ? "text-red-600"
                            : "text-muted-foreground"
                    )}
                  >
                    {change === "stable" ? t("status.stable") : change}
                  </span>
                </div>
                {nextRelease && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("marketPulse.nextRelease")}{" "}
                    {indicator.release_frequency === "Daily"
                      ? t("table.daily")
                      : new Date(nextRelease).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
