"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import { EconomicIndicator, CATEGORY_CONFIG, groupIndicatorsByCategory, getSortedCategories } from "@/lib/db/indicators";
import { IndicatorsTable } from "./indicators-table";
import { IndicatorDetailCard } from "./indicator-detail-card";

interface Props {
  indicators: EconomicIndicator[];
  formatValue: (indicator: EconomicIndicator, field: "current" | "previous") => string;
}

export function DetailView({ indicators, formatValue }: Props) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return <IndicatorsTable indicators={indicators} formatValue={formatValue} />;
  }

  // Mobile: Stacked cards
  const grouped = groupIndicatorsByCategory(indicators);
  const sortedCategories = getSortedCategories(grouped);

  return (
    <div className="space-y-8">
      {sortedCategories.map((category) => (
        <div key={category}>
          <h3 className="text-lg font-semibold mb-4">
            {CATEGORY_CONFIG[category]?.displayName ?? category}
          </h3>
          <div className="space-y-3">
            {grouped[category].map((indicator) => (
              <IndicatorDetailCard
                key={indicator.series_id}
                indicator={indicator}
                formattedCurrent={formatValue(indicator, "current")}
                formattedPrevious={formatValue(indicator, "previous")}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
