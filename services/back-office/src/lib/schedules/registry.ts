/**
 * Schedule registry for optional metadata enrichment.
 * Same pattern as redis/registry.ts and rabbitmq/registry.ts.
 * Schedules not in this registry still appear from discovery -- this just adds extra context.
 */

export interface ScheduleMetadata {
  description: string | null;
  category: string | null;
}

/**
 * Optional registry for enhanced metadata.
 * Key format: "worker-name:schedule-name" or just "schedule-name" for pattern matching.
 */
export const SCHEDULE_REGISTRY: Record<string, Partial<ScheduleMetadata>> = {
  "FRED Daily Macro Fetch": {
    description:
      "Fetches latest observations for all active FRED economic indicators",
    category: "data-fetcher",
  },
  "FRED Weekly Calendar Sync": {
    description:
      "Syncs release calendar dates for all tracked economic indicators",
    category: "data-fetcher",
  },
  "Alpaca Stock Fetch": {
    category: "data-fetcher",
  },
  "Alpaca Crypto Fetch": {
    category: "data-fetcher",
  },
  "Finnhub Fundamentals Fetch": {
    category: "data-fetcher",
  },
  "Monthly Earnings Sync": {
    category: "data-fetcher",
  },
  "Candlestick Analysis": {
    category: "analysis",
  },
  "Local Indicator Computation": {
    category: "analysis",
  },
  "Price Target Analysis": {
    category: "analysis",
  },
  "MarketAux News Fetch": {
    category: "data-fetcher",
  },
};

/**
 * Get metadata for a schedule.
 * Falls back to auto-derived values if not in registry.
 */
export function getScheduleMetadata(
  scheduleName: string,
  workerName?: string
): ScheduleMetadata {
  const autoMetadata: ScheduleMetadata = {
    description: null,
    category: deriveCategory(scheduleName),
  };

  // Try exact match by schedule name
  if (SCHEDULE_REGISTRY[scheduleName]) {
    return { ...autoMetadata, ...SCHEDULE_REGISTRY[scheduleName] };
  }

  // Try "worker:schedule" key
  if (workerName && SCHEDULE_REGISTRY[`${workerName}:${scheduleName}`]) {
    return {
      ...autoMetadata,
      ...SCHEDULE_REGISTRY[`${workerName}:${scheduleName}`],
    };
  }

  return autoMetadata;
}

function deriveCategory(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("analysis") || lower.includes("indicator") || lower.includes("price target")) {
    return "analysis";
  }
  if (lower.includes("fetch") || lower.includes("sync") || lower.includes("backfill")) {
    return "data-fetcher";
  }
  return null;
}
