import { EconomicIndicator, CATEGORY_CONFIG, groupIndicatorsByCategory, getSortedCategories } from "@/lib/db/indicators";
import { IndicatorDetailCard } from "./indicator-detail-card";
import { DetailViewResponsive } from "./detail-view-responsive";

interface Props {
  indicators: EconomicIndicator[];
  formatValue: (indicator: EconomicIndicator, field: "current" | "previous") => string;
}

// Prepare formatted data for serialization
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

export function DetailView({ indicators, formatValue }: Props) {
  const grouped = groupIndicatorsByCategory(indicators);
  const sortedCategories = getSortedCategories(grouped);

  // Pre-format all values in the Server Component
  const formattedCategories: FormattedCategory[] = sortedCategories.map((category) => ({
    category,
    displayName: CATEGORY_CONFIG[category]?.displayName ?? category,
    indicators: grouped[category].map((indicator) => ({
      indicator,
      formattedCurrent: formatValue(indicator, "current"),
      formattedPrevious: formatValue(indicator, "previous"),
    })),
  }));

  return <DetailViewResponsive formattedCategories={formattedCategories} />;
}
