"use client";

import { useState, useEffect } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { EconomicIndicator, CATEGORY_CONFIG, groupIndicatorsByCategory, getSortedCategories } from "@/lib/db/indicators";
import { IndicatorsTable } from "./indicators-table";
import { IndicatorDetailCard } from "./indicator-detail-card";

interface Props {
  indicators: EconomicIndicator[];
  formatValue: (indicator: EconomicIndicator, field: "current" | "previous") => string;
}

function MobileDetailView({ indicators, formatValue }: Props) {
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

export function DetailView({ indicators, formatValue }: Props) {
  const [mounted, setMounted] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render mobile view during SSR and initial hydration to avoid mismatch
  if (!mounted) {
    return <MobileDetailView indicators={indicators} formatValue={formatValue} />;
  }

  // After hydration, use responsive logic
  if (isDesktop) {
    return <IndicatorsTable indicators={indicators} formatValue={formatValue} />;
  }

  return <MobileDetailView indicators={indicators} formatValue={formatValue} />;
}
