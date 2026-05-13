import type { DemandEntry } from "./digest-demand.js";

export type DigestMode = "pre_open" | "post_close" | "intraday" | "on_demand";

export interface TriggerSlot {
  symbol: string;
  assetType: string;
  mode: DigestMode;
  windowStart: Date;
  windowEnd: Date;
  triggerReason: string;
  briefMode: string;
  digestDate: string;
}

export interface EvaluateTriggersParams {
  now: Date;
  modes: DigestMode[];
  triggerReason: string;
  demand: DemandEntry[];
  briefMode?: string;
}

const US_PRE_OPEN_HOUR_UTC = 13;
const US_POST_CLOSE_HOUR_UTC = 21;

function toUTCDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDateAt(d: Date, hour: number): Date {
  const out = new Date(d);
  out.setUTCHours(hour, 0, 0, 0);
  return out;
}

function isWeekday(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

function bucketToMinute(d: Date): Date {
  const out = new Date(d);
  out.setUTCSeconds(0, 0);
  return out;
}

export function evaluateTriggers(params: EvaluateTriggersParams): TriggerSlot[] {
  const { now, modes, triggerReason, demand, briefMode = "strict" } = params;
  const slots: TriggerSlot[] = [];
  const digestDate = toUTCDateString(now);

  for (const mode of modes) {
    for (const entry of demand) {
      const slot = buildSlot(
        entry,
        mode,
        now,
        digestDate,
        triggerReason,
        briefMode,
      );
      if (slot) slots.push(slot);
    }
  }

  return slots;
}

function buildSlot(
  entry: DemandEntry,
  mode: DigestMode,
  now: Date,
  digestDate: string,
  triggerReason: string,
  briefMode: string,
): TriggerSlot | null {
  const isCrypto = entry.assetType === "crypto";

  switch (mode) {
    case "pre_open": {
      if (isCrypto) return null;
      if (!isWeekday(now)) return null;
      const windowStart = utcDateAt(now, US_PRE_OPEN_HOUR_UTC);
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
      return {
        symbol: entry.symbol,
        assetType: entry.assetType,
        mode,
        windowStart,
        windowEnd,
        triggerReason,
        briefMode,
        digestDate,
      };
    }
    case "post_close": {
      if (isCrypto) return null;
      if (!isWeekday(now)) return null;
      const windowStart = utcDateAt(now, US_POST_CLOSE_HOUR_UTC);
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
      return {
        symbol: entry.symbol,
        assetType: entry.assetType,
        mode,
        windowStart,
        windowEnd,
        triggerReason,
        briefMode,
        digestDate,
      };
    }
    case "intraday": {
      const windowStart = bucketToMinute(now);
      const windowEnd = new Date(windowStart.getTime() + 60 * 1000);
      return {
        symbol: entry.symbol,
        assetType: entry.assetType,
        mode,
        windowStart,
        windowEnd,
        triggerReason,
        briefMode,
        digestDate,
      };
    }
    case "on_demand": {
      const windowStart = bucketToMinute(now);
      const windowEnd = new Date(windowStart.getTime() + 60 * 1000);
      return {
        symbol: entry.symbol,
        assetType: entry.assetType,
        mode,
        windowStart,
        windowEnd,
        triggerReason,
        briefMode,
        digestDate,
      };
    }
    default:
      return null;
  }
}
