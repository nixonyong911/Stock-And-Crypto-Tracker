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
}

export async function getEconomicIndicators(): Promise<EconomicIndicator[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("analysis_economic_indicators")
    .select(
      "series_id, category, display_name, current_value, previous_value, media_current_value, media_previous_value, display_mode, change_percent, trend, current_signal, units, description, current_observation_date"
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

export interface GroupedReleases {
  today: ReleaseCalendarEntry[];
  tomorrow: ReleaseCalendarEntry[];
  thisWeek: ReleaseCalendarEntry[];
  nextWeek: ReleaseCalendarEntry[];
}

export function groupReleasesByTimeframe(
  releases: ReleaseCalendarEntry[]
): GroupedReleases {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  const endOfThisWeek = new Date(today);
  endOfThisWeek.setDate(endOfThisWeek.getDate() + 7);
  const endOfNextWeek = new Date(today);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 14);

  const result: GroupedReleases = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
  };

  for (const release of releases) {
    if (!release.next_release_date) continue;

    const releaseDate = new Date(release.next_release_date);
    const releaseDateOnly = new Date(
      releaseDate.getFullYear(),
      releaseDate.getMonth(),
      releaseDate.getDate()
    );

    if (releaseDateOnly.getTime() === today.getTime()) {
      result.today.push(release);
    } else if (releaseDateOnly.getTime() === tomorrow.getTime()) {
      result.tomorrow.push(release);
    } else if (
      releaseDateOnly >= dayAfterTomorrow &&
      releaseDateOnly < endOfThisWeek
    ) {
      result.thisWeek.push(release);
    } else if (
      releaseDateOnly >= endOfThisWeek &&
      releaseDateOnly < endOfNextWeek
    ) {
      result.nextWeek.push(release);
    }
  }

  return result;
}
