"use client";

import { useState, useEffect } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { EconomicIndicator } from "@/lib/db/indicators";
import { IndicatorsTableClient } from "./indicators-table-client";
import { IndicatorDetailCard } from "./indicator-detail-card";

interface FormattedIndicator {
  indicator: EconomicIndicator;
  formattedCurrent: string;
  formattedPrevious: string;
}

interface FormattedCategory {
  category: string;
  displayName: string;
  indicators: FormattedIndicator[];
}

interface Props {
  formattedCategories: FormattedCategory[];
}

function MobileDetailCards({ formattedCategories }: Props) {
  return (
    <div className="space-y-8">
      {formattedCategories.map(({ category, displayName, indicators }) => (
        <div key={category}>
          <h3 className="text-lg font-semibold mb-4">{displayName}</h3>
          <div className="space-y-3">
            {indicators.map(({ indicator, formattedCurrent, formattedPrevious }) => (
              <IndicatorDetailCard
                key={indicator.series_id}
                indicator={indicator}
                formattedCurrent={formattedCurrent}
                formattedPrevious={formattedPrevious}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailViewResponsive({ formattedCategories }: Props) {
  const [mounted, setMounted] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render mobile view during SSR and initial hydration to avoid mismatch
  if (!mounted) {
    return <MobileDetailCards formattedCategories={formattedCategories} />;
  }

  // After hydration, use responsive logic
  if (isDesktop) {
    return <IndicatorsTableClient formattedCategories={formattedCategories} />;
  }

  return <MobileDetailCards formattedCategories={formattedCategories} />;
}
