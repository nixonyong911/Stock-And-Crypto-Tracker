/**
 * Determines whether a given date is a US stock market trading day
 * using the Alpaca /v2/calendar API, with a hardcoded NYSE holiday fallback.
 */

const ALPACA_CALENDAR_URL = "https://api.alpaca.markets/v2/calendar";

const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
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
  ["2026-01-01", "New Year's Day"], ["2026-01-19", "MLK Day"],
  ["2026-02-16", "Presidents' Day"], ["2026-04-03", "Good Friday"],
  ["2026-05-25", "Memorial Day"], ["2026-06-19", "Juneteenth"],
  ["2026-07-03", "Independence Day (observed)"], ["2026-09-07", "Labor Day"],
  ["2026-11-26", "Thanksgiving"], ["2026-12-25", "Christmas Day"],
  ["2027-01-01", "New Year's Day"], ["2027-01-18", "MLK Day"],
  ["2027-02-15", "Presidents' Day"], ["2027-03-26", "Good Friday"],
  ["2027-05-31", "Memorial Day"], ["2027-06-18", "Juneteenth (observed)"],
  ["2027-07-05", "Independence Day (observed)"], ["2027-09-06", "Labor Day"],
  ["2027-11-25", "Thanksgiving"], ["2027-12-24", "Christmas Day (observed)"],
]);

export interface MarketCalendarResult {
  isTradingDay: boolean;
  reason?: string;
  source: "alpaca" | "fallback";
}

export function toDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function fallbackCheck(d: Date): MarketCalendarResult {
  if (isWeekend(d)) {
    return {
      isTradingDay: false,
      reason: `Weekend (${DAY_NAMES[d.getUTCDay()]})`,
      source: "fallback",
    };
  }
  const key = toDateKey(d);
  const holiday = HOLIDAY_NAMES.get(key);
  if (holiday) {
    return { isTradingDay: false, reason: holiday, source: "fallback" };
  }
  return { isTradingDay: true, source: "fallback" };
}

export interface AlpacaCredentials {
  apiKeyId: string;
  apiSecretKey: string;
}

export async function checkTradingDay(
  d: Date,
  creds?: AlpacaCredentials,
): Promise<MarketCalendarResult> {
  if (!creds?.apiKeyId || !creds?.apiSecretKey) {
    return fallbackCheck(d);
  }

  const dateStr = toDateKey(d);

  try {
    const resp = await fetch(
      `${ALPACA_CALENDAR_URL}?start=${dateStr}&end=${dateStr}`,
      {
        headers: {
          "APCA-API-KEY-ID": creds.apiKeyId,
          "APCA-API-SECRET-KEY": creds.apiSecretKey,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!resp.ok) {
      console.warn(`Alpaca calendar API returned ${resp.status}, using fallback`);
      return fallbackCheck(d);
    }

    const data: unknown[] = await resp.json();
    if (data.length > 0) {
      return { isTradingDay: true, source: "alpaca" };
    }

    const fb = fallbackCheck(d);
    return {
      isTradingDay: false,
      reason: fb.reason ?? "Market closed",
      source: "alpaca",
    };
  } catch (err) {
    console.warn("Alpaca calendar API failed, using fallback:", (err as Error).message);
    return fallbackCheck(d);
  }
}
