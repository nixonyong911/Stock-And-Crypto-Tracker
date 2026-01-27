import { getSupabaseAdmin } from "./supabase";

export interface EconomicIndicator {
  series_id: string;
  category: string;
  display_name: string;
  current_value: number | null;
  change_percent: number | null;
  trend: "up" | "down" | "flat" | null;
  current_signal: "bullish" | "bearish" | "neutral" | null;
  units: string | null;
  description: string | null;
  current_observation_date: string | null;
}

export async function getEconomicIndicators(): Promise<EconomicIndicator[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("analysis_economic_indicators")
    .select(
      "series_id, category, display_name, current_value, change_percent, trend, current_signal, units, description, current_observation_date"
    )
    .eq("is_active", true)
    .order("display_order");

  if (error) throw error;
  return data ?? [];
}

// Group indicators by category for display
export function groupIndicatorsByCategory(
  indicators: EconomicIndicator[]
): Record<string, EconomicIndicator[]> {
  return indicators.reduce(
    (acc, indicator) => {
      const category = indicator.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(indicator);
      return acc;
    },
    {} as Record<string, EconomicIndicator[]>
  );
}

// Category display order and names
export const CATEGORY_CONFIG: Record<
  string,
  { displayName: string; order: number }
> = {
  interest_rates: { displayName: "Interest Rates", order: 1 },
  inflation: { displayName: "Inflation", order: 2 },
  yield_curve: { displayName: "Yield Curve", order: 3 },
  money_supply: { displayName: "Money Supply", order: 4 },
  credit: { displayName: "Credit", order: 5 },
};

export function getSortedCategories(
  grouped: Record<string, EconomicIndicator[]>
): string[] {
  return Object.keys(grouped).sort((a, b) => {
    const orderA = CATEGORY_CONFIG[a]?.order ?? 999;
    const orderB = CATEGORY_CONFIG[b]?.order ?? 999;
    return orderA - orderB;
  });
}
