import { EconomicIndicator } from "@/lib/db/indicators";

function getMediaValue(indicator: EconomicIndicator, field: "current" | "previous"): number | null {
  const media = field === "current" ? indicator.media_current_value : indicator.media_previous_value;
  if (media !== null && media !== undefined) return media;
  return field === "current" ? indicator.current_value : indicator.previous_value;
}

function formatByDisplayMode(value: number, indicator: EconomicIndicator): string {
  switch (indicator.display_mode) {
    case "rate":
      return `${value.toFixed(2)}%`;
    case "yoy_pct":
      return `${value.toFixed(1)}%`;
    case "trillions_from_billions":
    case "trillions_from_millions":
      return `$${value.toFixed(2)}T`;
    default:
      return formatByUnits(value, indicator.units);
  }
}

function formatByUnits(value: number, units: string | null): string {
  if (!units) return value.toLocaleString();

  switch (units) {
    case "Percent":
    case "YoY %":
      return `${value.toFixed(2)}%`;
    case "Billions USD":
      return `$${(value / 1000).toFixed(2)}T`;
    case "Millions USD":
      return `$${(value / 1000000).toFixed(2)}T`;
    case "Trillions USD":
      return `$${value.toFixed(2)}T`;
    case "Index":
      return value.toFixed(1);
    default:
      return value.toLocaleString();
  }
}

export function formatValue(indicator: EconomicIndicator): string {
  const value = getMediaValue(indicator, "current");
  if (value === null || value === undefined) return "N/A";
  if (indicator.display_mode) return formatByDisplayMode(value, indicator);
  return formatByUnits(value, indicator.units);
}

export function formatPrevious(indicator: EconomicIndicator): string {
  const value = getMediaValue(indicator, "previous");
  if (value === null || value === undefined) return "N/A";
  if (indicator.display_mode) return formatByDisplayMode(value, indicator);
  return formatByUnits(value, indicator.units);
}

/**
 * Returns media-style change text: "from X.X%" or "stable"
 */
export function formatChange(indicator: EconomicIndicator): string {
  const current = getMediaValue(indicator, "current");
  const previous = getMediaValue(indicator, "previous");

  if (current === null || previous === null) return "";
  if (current === previous) return "stable";

  const prevFormatted = indicator.display_mode
    ? formatByDisplayMode(previous, indicator)
    : formatByUnits(previous, indicator.units);

  return `from ${prevFormatted}`;
}

/**
 * Appends media qualifiers to display name (e.g., "CPI" -> "CPI (YoY)")
 */
export function formatDisplayName(indicator: EconomicIndicator): string {
  const name = indicator.display_name;
  if (indicator.display_mode === "yoy_pct") {
    if (!name.includes("YoY")) return `${name} (YoY)`;
  }
  return name;
}
