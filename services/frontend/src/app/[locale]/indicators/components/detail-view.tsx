import { EconomicIndicator, CATEGORY_CONFIG, groupIndicatorsByCategory, getSortedCategories } from "@/lib/db/indicators";
import { formatValue, formatPrevious, formatChange, formatDisplayName } from "../lib/format";
import { DetailViewResponsive } from "./detail-view-responsive";

interface Props {
  indicators: EconomicIndicator[];
  releaseMap: Map<string, string | null>;
}

export interface FormattedIndicator {
  indicator: EconomicIndicator;
  displayName: string;
  formattedCurrent: string;
  formattedPrevious: string;
  formattedChange: string;
  nextRelease: string | null;
}

export interface FormattedCategory {
  category: string;
  displayName: string;
  indicators: FormattedIndicator[];
}

export function DetailView({ indicators, releaseMap }: Props) {
  const grouped = groupIndicatorsByCategory(indicators);
  const sortedCategories = getSortedCategories(grouped);

  const formattedCategories: FormattedCategory[] = sortedCategories.map((category) => ({
    category,
    displayName: CATEGORY_CONFIG[category]?.displayName ?? category,
    indicators: grouped[category].map((indicator) => ({
      indicator,
      displayName: formatDisplayName(indicator),
      formattedCurrent: formatValue(indicator),
      formattedPrevious: formatPrevious(indicator),
      formattedChange: formatChange(indicator),
      nextRelease: releaseMap.get(indicator.series_id) ?? null,
    })),
  }));

  return <DetailViewResponsive formattedCategories={formattedCategories} />;
}
