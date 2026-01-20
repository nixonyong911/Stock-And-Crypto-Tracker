// Cache registry for Redis monitoring UI
// Maps key patterns to their metadata for display

export interface CacheMetadata {
  owner: string;
  ttl: number; // seconds
  description: string;
  refreshEndpoint: string | null; // API endpoint to refresh this cache, null if manual only
}

export const CACHE_REGISTRY: Record<string, CacheMetadata> = {
  "back-office:workers": {
    owner: "Back Office",
    ttl: 86400, // 24 hours
    description: "Worker registry from Supabase",
    refreshEndpoint: "/back-office/api/workers?refresh=true",
  },
  "back-office:schedules": {
    owner: "Back Office",
    ttl: 86400, // 24 hours
    description: "Fetch schedules from Supabase",
    refreshEndpoint: "/back-office/api/schedules?refresh=true",
  },
  "back-office:worker:*": {
    owner: "Back Office",
    ttl: 86400, // 24 hours
    description: "Individual worker cache",
    refreshEndpoint: null, // Cleared when workers are refreshed
  },
  "back-office:schedule:*": {
    owner: "Back Office",
    ttl: 86400, // 24 hours
    description: "Individual schedule cache",
    refreshEndpoint: null,
  },
  "mcp-analysis__*": {
    owner: "MCP Analysis",
    ttl: 86400, // 24 hours
    description: "Cached database query results",
    refreshEndpoint: null, // No auto-refresh, just clear
  },
  "chat:*": {
    owner: "Telegram Bot",
    ttl: 600, // 10 minutes
    description: "Message queue locks and state",
    refreshEndpoint: null, // Managed by bot
  },
};

/**
 * Get metadata for a cache key by matching against patterns
 */
export function getCacheMetadata(key: string): CacheMetadata | null {
  // Try exact match first
  if (CACHE_REGISTRY[key]) {
    return CACHE_REGISTRY[key];
  }

  // Try pattern matching (replace * with regex)
  for (const [pattern, metadata] of Object.entries(CACHE_REGISTRY)) {
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      if (regex.test(key)) {
        return metadata;
      }
    }
  }

  return null;
}

/**
 * Get the owner of a cache key
 */
export function getCacheOwner(key: string): string {
  const metadata = getCacheMetadata(key);
  return metadata?.owner || "Unknown";
}
