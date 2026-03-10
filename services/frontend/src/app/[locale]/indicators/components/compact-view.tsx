import { EconomicIndicator, CATEGORY_CONFIG, getSortedCategories, groupIndicatorsByCategory } from "@/lib/db/indicators";
import { CategoryRow } from "./category-row";

interface Props {
  indicators: EconomicIndicator[];
  releaseMap: Map<string, string | null>;
}

export function CompactView({ indicators, releaseMap }: Props) {
  const grouped = groupIndicatorsByCategory(indicators);
  const sortedCategories = getSortedCategories(grouped);

  return (
    <div className="space-y-6">
      {sortedCategories.map((category) => (
        <CategoryRow
          key={category}
          category={category}
          categoryDisplayName={CATEGORY_CONFIG[category]?.displayName ?? category}
          indicators={grouped[category]}
          releaseMap={releaseMap}
        />
      ))}
    </div>
  );
}
