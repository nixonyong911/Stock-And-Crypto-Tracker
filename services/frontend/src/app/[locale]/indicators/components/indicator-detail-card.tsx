import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { EconomicIndicator } from "@/lib/db/indicators";
import { TrendIcon } from "./trend-icon";
import { SignalBadge } from "./signal-badge";
import { cn } from "@/lib/utils";

interface Props {
  indicator: EconomicIndicator;
  formattedCurrent: string;
  formattedPrevious: string;
}

export function IndicatorDetailCard({ indicator, formattedCurrent, formattedPrevious }: Props) {
  const t = useTranslations("indicators");
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h4 className="font-medium">{indicator.display_name}</h4>
          <SignalBadge signal={indicator.current_signal} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">{t("detailCard.current")}</p>
            <p className="font-mono font-bold text-lg">{formattedCurrent}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("detailCard.previous")}</p>
            <p className="font-mono text-muted-foreground">{formattedPrevious}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <TrendIcon trend={indicator.trend} />
            {indicator.change_percent !== null && (
              <span className={cn(
                "text-sm font-mono",
                indicator.change_percent > 0 && "text-green-600",
                indicator.change_percent < 0 && "text-red-600"
              )}>
                {indicator.change_percent > 0 ? "+" : ""}{indicator.change_percent.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {(indicator.last_release_date ?? indicator.current_observation_date) && (
              <div>{t("detailCard.updated")} {new Date(indicator.last_release_date ?? indicator.current_observation_date!).toLocaleDateString()}</div>
            )}
            <div>
              {t("detailCard.next")} {indicator.release_frequency === "Daily"
                ? t("detailCard.daily")
                : indicator.next_release_date
                  ? new Date(indicator.next_release_date).toLocaleDateString()
                  : t("detailCard.na")}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
