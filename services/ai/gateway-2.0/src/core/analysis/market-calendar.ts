/**
 * US equity market calendar — holiday awareness, day-of-week formatting,
 * and market-status helpers.
 *
 * NYSE holidays are hardcoded for 2025-2027. Crypto markets trade 24/7
 * so these helpers only apply to stock/ETF assets.
 */

const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01",
  "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
  "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
  "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26",
  "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06",
  "2027-11-25", "2027-12-24",
]);

const HOLIDAY_NAMES: ReadonlyMap<string, string> = new Map([
  // 2025
  ["2025-01-01", "New Year's Day"], ["2025-01-20", "MLK Day"],
  ["2025-02-17", "Presidents' Day"], ["2025-04-18", "Good Friday"],
  ["2025-05-26", "Memorial Day"], ["2025-06-19", "Juneteenth"],
  ["2025-07-04", "Independence Day"], ["2025-09-01", "Labor Day"],
  ["2025-11-27", "Thanksgiving"], ["2025-12-25", "Christmas Day"],
  // 2026
  ["2026-01-01", "New Year's Day"], ["2026-01-19", "MLK Day"],
  ["2026-02-16", "Presidents' Day"], ["2026-04-03", "Good Friday"],
  ["2026-05-25", "Memorial Day"], ["2026-06-19", "Juneteenth"],
  ["2026-07-03", "Independence Day (observed)"], ["2026-09-07", "Labor Day"],
  ["2026-11-26", "Thanksgiving"], ["2026-12-25", "Christmas Day"],
  // 2027
  ["2027-01-01", "New Year's Day"], ["2027-01-18", "MLK Day"],
  ["2027-02-15", "Presidents' Day"], ["2027-03-26", "Good Friday"],
  ["2027-05-31", "Memorial Day"], ["2027-06-18", "Juneteenth (observed)"],
  ["2027-07-05", "Independence Day (observed)"], ["2027-09-06", "Labor Day"],
  ["2027-11-25", "Thanksgiving"], ["2027-12-24", "Christmas Day (observed)"],
]);

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export interface MarketStatus {
  open: boolean;
  reason?: string;
  nextSession: string;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a date string (YYYY-MM-DD) into a Date at midnight UTC.
 * Falls back to `new Date()` if the string is unparseable.
 */
function parseDate(dateStr: string): Date {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  }
  return new Date(dateStr);
}

/** True if the given date falls on a weekend (Saturday or Sunday). */
export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/** True if the given date is a known NYSE holiday. */
export function isNYSEHoliday(d: Date): boolean {
  return NYSE_HOLIDAYS.has(toDateKey(d));
}

/** True if the US equity market is open on this date (not weekend, not holiday). */
export function isUSMarketDay(d: Date): boolean {
  return !isWeekend(d) && !isNYSEHoliday(d);
}

/** Find the next trading day on or after the given date. */
export function nextTradingDay(d: Date): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  while (!isUSMarketDay(next)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

/** Get the market status for a given date. */
export function getMarketStatus(d: Date): MarketStatus {
  const key = toDateKey(d);
  if (isWeekend(d)) {
    return {
      open: false,
      reason: `Weekend (${DAY_NAMES[d.getUTCDay()]})`,
      nextSession: formatDateWithDay(toDateKey(nextTradingDay(d))),
    };
  }
  const holiday = HOLIDAY_NAMES.get(key);
  if (holiday) {
    return {
      open: false,
      reason: holiday,
      nextSession: formatDateWithDay(toDateKey(nextTradingDay(d))),
    };
  }
  return { open: true, nextSession: formatDateWithDay(key) };
}

/**
 * Format a YYYY-MM-DD date string as "Jan 16, 2026 (Friday)".
 */
export function formatDateWithDay(dateStr: string): string {
  const d = parseDate(dateStr);
  const day = DAY_NAMES[d.getUTCDay()];
  const month = MONTH_NAMES[d.getUTCMonth()];
  return `${month} ${d.getUTCDate()}, ${d.getUTCFullYear()} (${day})`;
}

/**
 * Format a YYYY-MM-DD date string with timezone label.
 * Example: "Jan 16, 2026 (Friday) ET"
 *
 * If an IANA timezone is provided (e.g., "America/New_York"), derives a
 * short label from the Intl API. Otherwise defaults to "ET".
 */
export function formatDateWithDayAndTz(dateStr: string, tzLabel = "ET"): string {
  return `${formatDateWithDay(dateStr)} ${tzLabel}`;
}

/**
 * Derive a short timezone abbreviation from an IANA timezone name.
 * Falls back to "ET" for UTC or if detection fails.
 */
export function tzAbbreviation(ianaTimezone: string): string {
  if (!ianaTimezone || ianaTimezone === "UTC") return "ET";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value ?? "ET";
  } catch {
    return "ET";
  }
}
