import { EconomicIndicator, CATEGORY_CONFIG, getSortedCategories, groupIndicatorsByCategory } from "@/lib/db/indicators";
import { CategoryRow } from "./category-row";

interface Props {
  indicators: EconomicIndicator[];
  formatValue: (indicator: EconomicIndicator, field: "current" | "previous") => string;
}

export function CompactView({ indicators, formatValue }: Props) {
  const grouped = groupIndicatorsByCategory(indicators);
  const sortedCategories = getSortedCategories(grouped);

  return (
    <div className="space-y-8">
      {sortedCategories.map((category) => (
        <CategoryRow
          key={category}
          category={category}
          categoryDisplayName={CATEGORY_CONFIG[category]?.displayName ?? category}
          indicators={grouped[category]}
          formatValue={formatValue}
        />
      ))}
    </div>
  );
}
