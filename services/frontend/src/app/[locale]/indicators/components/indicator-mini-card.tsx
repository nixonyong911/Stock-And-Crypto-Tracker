import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendIcon } from "./trend-icon";
import { SignalBadge } from "./signal-badge";
import { EconomicIndicator } from "@/lib/db/indicators";

interface Props {
  indicator: EconomicIndicator;
  formattedValue: string;
  formattedPrevious: string;
}

export function IndicatorMiniCard({ indicator, formattedValue, formattedPrevious }: Props) {
  const t = useTranslations("indicators");
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="min-w-[120px] max-w-[140px] p-3 cursor-pointer hover:border-primary/50 transition-colors flex-shrink-0 snap-start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground truncate">
                {indicator.display_name}
              </p>
              <p className="text-lg font-bold truncate">{formattedValue}</p>
              <div className="flex items-center gap-2">
                <TrendIcon trend={indicator.trend} className="h-3 w-3" />
                <SignalBadge signal={indicator.current_signal} compact />
              </div>
            </div>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <div className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">{t("miniCard.previous")}</span> {formattedPrevious}</p>
            {indicator.change_percent !== null && (
              <p>
                <span className="text-muted-foreground">{t("miniCard.change")}</span>{" "}
                <span className={indicator.change_percent > 0 ? "text-green-500" : indicator.change_percent < 0 ? "text-red-500" : ""}>
                  {indicator.change_percent > 0 ? "+" : ""}{indicator.change_percent.toFixed(1)}%
                </span>
              </p>
            )}
            {(indicator.last_release_date ?? indicator.current_observation_date) && (
              <p><span className="text-muted-foreground">{t("miniCard.updated")}</span> {new Date(indicator.last_release_date ?? indicator.current_observation_date!).toLocaleDateString()}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
