"use client";

import { useState, useEffect } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { IndicatorsTableClient } from "./indicators-table-client";
import { IndicatorDetailCard } from "./indicator-detail-card";
import type { FormattedCategory } from "./detail-view";

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
            {indicators.map(({ indicator, displayName: name, formattedCurrent, formattedPrevious, formattedChange, nextRelease }) => (
              <IndicatorDetailCard
                key={indicator.series_id}
                indicator={indicator}
                displayName={name}
                formattedCurrent={formattedCurrent}
                formattedPrevious={formattedPrevious}
                formattedChange={formattedChange}
                nextRelease={nextRelease}
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

  if (!mounted) {
    return <MobileDetailCards formattedCategories={formattedCategories} />;
  }

  if (isDesktop) {
    return <IndicatorsTableClient formattedCategories={formattedCategories} />;
  }

  return <MobileDetailCards formattedCategories={formattedCategories} />;
}
