import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { EconomicIndicator } from "@/lib/db/indicators";
import { TrendIcon } from "./trend-icon";
import { SignalBadge } from "./signal-badge";
import { cn } from "@/lib/utils";

interface Props {
  indicator: EconomicIndicator;
  displayName: string;
  formattedCurrent: string;
  formattedPrevious: string;
  formattedChange: string;
  nextRelease: string | null;
}

export function IndicatorDetailCard({
  indicator,
  displayName,
  formattedCurrent,
  formattedPrevious,
  formattedChange,
  nextRelease,
}: Props) {
  const t = useTranslations("indicators");
  const isStable = formattedChange === "stable";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h4 className="font-medium">{displayName}</h4>
          <SignalBadge signal={indicator.current_signal} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">{t("table.current")}</p>
            <p className="font-mono font-bold text-lg">{formattedCurrent}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("table.previous")}</p>
            <p className="font-mono text-muted-foreground">{formattedPrevious}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <TrendIcon trend={indicator.trend} />
            <span
              className={cn(
                "text-sm font-mono",
                isStable
                  ? "text-muted-foreground"
                  : indicator.trend === "up"
                    ? "text-green-600"
                    : indicator.trend === "down"
                      ? "text-red-600"
                      : "text-muted-foreground"
              )}
            >
              {isStable ? t("status.stable") : formattedChange}
            </span>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {(indicator.last_release_date ?? indicator.current_observation_date) && (
              <div>
                {t("table.updated")}{" "}
                {new Date(
                  indicator.last_release_date ?? indicator.current_observation_date!
                ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
            )}
            <div>
              {t("table.nextRelease")}{" "}
              {indicator.release_frequency === "Daily"
                ? t("table.daily")
                : nextRelease
                  ? new Date(nextRelease).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : t("table.na")}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
