import { EconomicIndicator } from "@/lib/db/indicators";
import { IndicatorMiniCard } from "./indicator-mini-card";
import { ChevronRight } from "lucide-react";

interface Props {
  category: string;
  categoryDisplayName: string;
  indicators: EconomicIndicator[];
  formatValue: (indicator: EconomicIndicator, field: "current" | "previous") => string;
}

export function CategoryRow({ category, categoryDisplayName, indicators, formatValue }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{categoryDisplayName}</h3>
        <ChevronRight className="h-4 w-4 text-muted-foreground md:hidden" />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
        {indicators.map((indicator) => (
          <IndicatorMiniCard
            key={indicator.series_id}
            indicator={indicator}
            formattedValue={formatValue(indicator, "current")}
            formattedPrevious={formatValue(indicator, "previous")}
          />
        ))}
      </div>
    </div>
  );
}
