import type { TableCheck, SkipRule } from "./table-config.js";
import type { MarketCalendarResult } from "./market-calendar.js";
import { isWeekend } from "./market-calendar.js";

export interface CheckResult {
  table: string;
  label: string;
  status: "ok" | "stale" | "skipped";
  ageHours: number | null;
  thresholdHours: number;
  skipReason?: string;
  latestTimestamp?: string;
}

export type TimestampFetcher = (
  table: string,
  column: string,
) => Promise<Date | null>;

function shouldSkip(
  skipRule: SkipRule,
  now: Date,
  market: MarketCalendarResult,
): { skip: boolean; reason?: string } {
  switch (skipRule) {
    case "market-closed":
      if (!market.isTradingDay) {
        return { skip: true, reason: market.reason ?? "Market closed" };
      }
      return { skip: false };

    case "weekends":
      if (isWeekend(now)) {
        const dayName = ["Sunday", "", "", "", "", "", "Saturday"][now.getUTCDay()];
        return { skip: true, reason: `Weekend (${dayName})` };
      }
      return { skip: false };

    case "never":
      return { skip: false };
  }
}

function computeAgeHours(latest: Date, now: Date): number {
  return (now.getTime() - latest.getTime()) / (1000 * 60 * 60);
}

export function evaluateTable(
  check: TableCheck,
  latestTimestamp: Date | null,
  now: Date,
  market: MarketCalendarResult,
): CheckResult {
  const { skip, reason } = shouldSkip(check.skipRule, now, market);

  if (skip) {
    return {
      table: check.table,
      label: check.label,
      status: "skipped",
      ageHours: null,
      thresholdHours: check.thresholdHours,
      skipReason: reason,
    };
  }

  if (!latestTimestamp) {
    return {
      table: check.table,
      label: check.label,
      status: "stale",
      ageHours: null,
      thresholdHours: check.thresholdHours,
      latestTimestamp: "never",
    };
  }

  const ageHours = computeAgeHours(latestTimestamp, now);

  return {
    table: check.table,
    label: check.label,
    status: ageHours > check.thresholdHours ? "stale" : "ok",
    ageHours: Math.round(ageHours * 10) / 10,
    thresholdHours: check.thresholdHours,
    latestTimestamp: latestTimestamp.toISOString(),
  };
}

export async function evaluateAll(
  checks: readonly TableCheck[],
  fetchTimestamp: TimestampFetcher,
  now: Date,
  market: MarketCalendarResult,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    try {
      const latest = await fetchTimestamp(check.table, check.column);
      results.push(evaluateTable(check, latest, now, market));
    } catch (err) {
      results.push({
        table: check.table,
        label: check.label,
        status: "stale",
        ageHours: null,
        thresholdHours: check.thresholdHours,
        latestTimestamp: `error: ${(err as Error).message}`,
      });
    }
  }

  return results;
}
