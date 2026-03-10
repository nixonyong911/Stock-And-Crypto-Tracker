import { getSupabaseAdmin } from "./supabase";

export interface EconomicIndicator {
  series_id: string;
  category: string;
  display_name: string;
  current_value: number | null;
  previous_value: number | null;
  media_current_value: number | null;
  media_previous_value: number | null;
  display_mode:
    | "rate"
    | "yoy_pct"
    | "trillions_from_billions"
    | "trillions_from_millions"
    | null;
  change_percent: number | null;
  trend: "up" | "down" | "flat" | null;
  current_signal: "bullish" | "bearish" | "neutral" | null;
  units: string | null;
  description: string | null;
  current_observation_date: string | null;
  last_release_date: string | null;
  // From analysis_release_calendar join
  next_release_date: string | null;
  release_frequency: string | null;
}

export async function getEconomicIndicators(): Promise<EconomicIndicator[]> {
  const supabase = getSupabaseAdmin();

  // Fetch indicators and calendar data separately, then merge
  // (Supabase embedded select wasn't detecting the FK relationship properly)
  const [indicatorsResult, calendarResult] = await Promise.all([
    supabase
      .from("analysis_economic_indicators")
      .select(
        `series_id, category, display_name, current_value, previous_value,
         media_current_value, media_previous_value, display_mode, change_percent,
         trend, current_signal, units, description, current_observation_date,
         last_release_date`
      )
      .eq("is_active", true)
      .order("display_order"),
    supabase
      .from("analysis_release_calendar")
      .select("series_id, next_release_date, release_frequency"),
  ]);

  if (indicatorsResult.error) throw indicatorsResult.error;
  if (calendarResult.error) throw calendarResult.error;

  // Build lookup map for calendar data
  const calendarMap = new Map<
    string,
    { next_release_date: string | null; release_frequency: string | null }
  >();
  for (const cal of calendarResult.data ?? []) {
    calendarMap.set(cal.series_id, {
      next_release_date: cal.next_release_date,
      release_frequency: cal.release_frequency,
    });
  }

  // Merge indicators with calendar data
  return (indicatorsResult.data ?? []).map((item) => {
    const calendar = calendarMap.get(item.series_id);
    return {
      series_id: item.series_id,
      category: item.category,
      display_name: item.display_name,
      current_value: item.current_value,
      previous_value: item.previous_value,
      media_current_value: item.media_current_value,
      media_previous_value: item.media_previous_value,
      display_mode: item.display_mode,
      change_percent: item.change_percent,
      trend: item.trend,
      current_signal: item.current_signal,
      units: item.units,
      description: item.description,
      current_observation_date: item.current_observation_date,
      last_release_date: item.last_release_date,
      next_release_date: calendar?.next_release_date ?? null,
      release_frequency: calendar?.release_frequency ?? null,
    };
  });
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
  labor: { displayName: "Labor Market", order: 4 },
  growth: { displayName: "Economic Growth", order: 5 },
  sentiment: { displayName: "Consumer Sentiment", order: 6 },
  money_supply: { displayName: "Money Supply", order: 7 },
  credit: { displayName: "Credit", order: 8 },
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

// Release Calendar types and functions
export interface ReleaseCalendarEntry {
  series_id: string;
  release_name: string;
  next_release_date: string | null;
  following_release_date: string | null;
  release_frequency: string | null;
}

export async function getReleaseCalendar(): Promise<ReleaseCalendarEntry[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("analysis_release_calendar")
    .select(
      "series_id, release_name, next_release_date, following_release_date, release_frequency"
    )
    .order("next_release_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

