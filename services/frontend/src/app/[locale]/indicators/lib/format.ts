import { EconomicIndicator } from "@/lib/db/indicators";

export type DataMode = "media" | "raw";

/**
 * Format indicator value based on data mode and display configuration
 */
export function formatIndicatorValue(
  indicator: EconomicIndicator,
  field: "current" | "previous",
  dataMode: DataMode
): string {
  // Get the appropriate value based on data mode and field
  let value: number | null;
  
  if (dataMode === "media") {
    value = field === "current" 
      ? indicator.media_current_value 
      : indicator.media_previous_value;
    
    // Fallback to raw if media not available
    if (value === null) {
      value = field === "current" 
        ? indicator.current_value 
        : indicator.previous_value;
    }
  } else {
    value = field === "current" 
      ? indicator.current_value 
      : indicator.previous_value;
  }

  if (value === null || value === undefined) return "N/A";

  // Format based on display_mode when using media values
  if (dataMode === "media" && indicator.display_mode) {
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

  // Raw mode or no display_mode: format by units
  return formatByUnits(value, indicator.units);
}

/**
 * Format value based on units field (for raw values)
 */
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
      return value.toFixed(2);
    default:
      return value.toLocaleString();
  }
}

/**
 * Create a formatting function bound to a specific data mode
 */
export function createValueFormatter(dataMode: DataMode) {
  return (indicator: EconomicIndicator, field: "current" | "previous"): string => {
    return formatIndicatorValue(indicator, field, dataMode);
  };
}
