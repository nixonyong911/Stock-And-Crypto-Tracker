import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EconomicIndicator } from "@/lib/db/indicators";
import { formatValue, formatChange, formatDisplayName } from "../lib/format";
import { TrendIcon } from "./trend-icon";
import { SignalBadge } from "./signal-badge";
import { cn } from "@/lib/utils";

interface Props {
  category: string;
  categoryDisplayName: string;
  indicators: EconomicIndicator[];
  releaseMap: Map<string, string | null>;
}

export function CategoryRow({ categoryDisplayName, indicators, releaseMap }: Props) {
  const t = useTranslations("indicators");

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base font-semibold">{categoryDisplayName}</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {/* Desktop header */}
        <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 pb-2 text-xs font-medium text-muted-foreground border-b">
          <span>{t("table.indicator")}</span>
          <span className="w-20 text-right">{t("table.current")}</span>
          <span className="w-28 text-right">{t("table.change")}</span>
          <span className="w-10 text-center">{t("table.signal")}</span>
          <span className="w-20 text-right">{t("table.nextRelease")}</span>
        </div>
        <div className="divide-y">
          {indicators.map((indicator) => {
            const value = formatValue(indicator);
            const change = formatChange(indicator);
            const nextRelease = releaseMap.get(indicator.series_id);
            const isStable = change === "stable";

            return (
              <div
                key={indicator.series_id}
                className="flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2.5 hover:bg-muted/50 transition-colors"
              >
                {/* Name + value on mobile */}
                <div className="flex items-center justify-between sm:justify-start">
                  <span className="text-sm font-medium truncate">
                    {formatDisplayName(indicator)}
                  </span>
                  <span className="text-sm font-bold font-mono sm:hidden">{value}</span>
                </div>

                {/* Desktop value */}
                <span className="hidden sm:block w-20 text-right text-sm font-bold font-mono">
                  {value}
                </span>

                {/* Change */}
                <div className="flex items-center gap-1.5 sm:w-28 sm:justify-end">
                  <TrendIcon trend={indicator.trend} className="h-3 w-3" />
                  <span
                    className={cn(
                      "text-xs font-mono",
                      isStable
                        ? "text-muted-foreground"
                        : indicator.trend === "up"
                          ? "text-green-600"
                          : indicator.trend === "down"
                            ? "text-red-600"
                            : "text-muted-foreground"
                    )}
                  >
                    {isStable ? t("status.stable") : change}
                  </span>
                </div>

                {/* Signal dot */}
                <div className="hidden sm:flex sm:w-10 sm:justify-center sm:items-center">
                  <SignalBadge signal={indicator.current_signal} compact />
                </div>

                {/* Next release */}
                <div className="flex items-center justify-between sm:justify-end sm:w-20">
                  <span className="text-xs text-muted-foreground sm:hidden">
                    {t("marketPulse.nextRelease")}
                  </span>
                  <span className="text-xs text-muted-foreground text-right">
                    {indicator.release_frequency === "Daily"
                      ? t("table.daily")
                      : nextRelease
                        ? new Date(nextRelease).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : t("table.na")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
